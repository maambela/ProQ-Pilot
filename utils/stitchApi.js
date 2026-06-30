const crypto = require('crypto');
const axios = require('axios');

const STITCH_EXPRESS_BASE_URL = 'https://express.stitch.money';

let tokenCache = null;

function requiredEnv(name) {
    const value = String(process.env[name] || '').trim();
    if (!value) {
        throw new Error(`${name} is not configured`);
    }
    return value;
}

function getBaseUrl() {
    return String(process.env.STITCH_EXPRESS_BASE_URL || STITCH_EXPRESS_BASE_URL).replace(/\/+$/, '');
}


function validateCheckoutConfiguration() {
    [
        'STITCH_CLIENT_ID',
        'STITCH_CLIENT_SECRET',
        'STITCH_REDIRECT_URI'
    ].forEach(requiredEnv);
}

function getConfigurationStatus() {
    const checkoutRequired = [
        'STITCH_CLIENT_ID',
        'STITCH_CLIENT_SECRET',
        'STITCH_REDIRECT_URI'
    ];
    const missingCheckout = checkoutRequired.filter(name => !String(process.env[name] || '').trim());

    return {
        checkoutReady: missingCheckout.length === 0,
        missingCheckout,
        expressBaseUrl: getBaseUrl(),
        merchantIdConfigured: Boolean(String(process.env.STITCH_MERCHANT_ID || '').trim()),
        webhookReady: Boolean(String(process.env.STITCH_WEBHOOK_SECRET || '').trim()),
        requirePaymentConfirmation: false,
        redirectUri: String(process.env.STITCH_REDIRECT_URI || '').trim() || null
    };
}

function stitchErrorMessage(response, fallback) {
    const data = response?.data || {};
    if (typeof data === 'string') return data || fallback;
    if (data.message) return data.message;
    if (data.error) return data.error;
    if (Array.isArray(data.errors)) {
        return data.errors.map(error => error.message || String(error)).join('; ');
    }
    return fallback;
}

async function getClientToken() {
    if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
        return tokenCache.accessToken;
    }

    const response = await axios.post(
        `${getBaseUrl()}/api/v1/token`,
        {
            clientId: requiredEnv('STITCH_CLIENT_ID'),
            clientSecret: requiredEnv('STITCH_CLIENT_SECRET')
        },
        {
            headers: { 'Content-Type': 'application/json' },
            validateStatus: () => true
        }
    );

    const accessToken = response.data?.data?.accessToken;
    if (response.status < 200 || response.status >= 300 || !accessToken) {
        const message = stitchErrorMessage(response, 'Unable to retrieve Stitch Express client token');
        if (/invalid_client|invalid client secret/i.test(message)) {
            throw new Error('Stitch Express rejected the configured client credentials. Copy the latest Client ID and Client Secret from the Stitch Express Dashboard into Google Secret Manager, then redeploy Cloud Run.');
        }
        throw new Error(message);
    }

    tokenCache = {
        accessToken,
        expiresAt: Date.now() + (15 * 60 * 1000)
    };

    return tokenCache.accessToken;
}

async function expressRequest(method, path, body) {
    const accessToken = await getClientToken();
    const response = await axios({
        method,
        url: `${getBaseUrl()}${path}`,
        data: body,
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        validateStatus: () => true
    });

    if (response.status < 200 || response.status >= 300 || response.data?.success === false) {
        throw new Error(stitchErrorMessage(response, `Stitch Express API request failed with status ${response.status}`));
    }

    return response.data?.data || response.data;
}

function toCents(amount) {
    return Math.round(Number(amount) * 100);
}

async function createPaymentRequest({ amount, externalReference, payerReference, payerInformation }) {
    const payerName = payerInformation?.fullName || payerInformation?.email || 'StackOps customer';
    const data = await expressRequest('post', '/api/v1/payment-links', {
        amount: toCents(amount),
        payerName,
        merchantReference: externalReference || payerReference
    });

    const payment = data.payment || data;
    const paymentLink = payment.link || payment.url || payment.paymentUrl;
    if (!payment?.id || !paymentLink) {
        throw new Error('Stitch Express did not return a payment link');
    }

    return {
        ...payment,
        url: paymentLink,
        externalReference: payment.merchantReference || externalReference || payerReference
    };
}

async function getPaymentRequest(paymentId) {
    const data = await expressRequest('get', `/api/v1/payment/${encodeURIComponent(paymentId)}`);
    const payment = data.payment || data;
    if (!payment?.id) {
        throw new Error('Stitch Express payment was not found');
    }
    return payment;
}

async function registerRedirectUrl(redirectUrl = requiredEnv('STITCH_REDIRECT_URI')) {
    const normalizedRedirectUrl = String(redirectUrl || '').replace(/\/$/, '');
    if (!normalizedRedirectUrl) {
        throw new Error('STITCH_REDIRECT_URI is not configured');
    }
    try {
        return await expressRequest('post', '/api/v1/redirect-urls', {
            redirectUrl: normalizedRedirectUrl
        });
    } catch (error) {
        if (/limit/i.test(error.message)) {
            throw new Error(`Stitch Express redirect URL limit reached. Delete an old redirect URL in the Stitch Express dashboard, then register ${normalizedRedirectUrl}.`);
        }
        throw error;
    }
}

function appendRedirectUri(paymentUrl, params = {}) {
    const url = new URL(paymentUrl);
    const redirectUrl = new URL(requiredEnv('STITCH_REDIRECT_URI'));
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            redirectUrl.searchParams.set(key, String(value));
        }
    });
    url.searchParams.set('redirect_url', redirectUrl.toString());
    return url.toString();
}

function verifySvixWebhook(rawBody, headers, secret = process.env.STITCH_WEBHOOK_SECRET) {
    const signingSecret = String(secret || '').trim();
    if (!signingSecret) {
        throw new Error('STITCH_WEBHOOK_SECRET is not configured');
    }
    if (!Buffer.isBuffer(rawBody)) {
        throw new Error('Raw webhook body is required for signature verification');
    }

    const messageId = headers['svix-id'];
    const timestamp = headers['svix-timestamp'];
    const signatureHeader = headers['svix-signature'];
    if (!messageId || !timestamp || !signatureHeader) {
        throw new Error('Missing Svix signature headers');
    }

    const timestampSeconds = Number(timestamp);
    if (!Number.isFinite(timestampSeconds) || Math.abs(Date.now() / 1000 - timestampSeconds) > 300) {
        throw new Error('Webhook timestamp is outside the allowed tolerance');
    }

    const secretPart = signingSecret.startsWith('whsec_')
        ? signingSecret.slice('whsec_'.length)
        : signingSecret;
    const signedContent = `${messageId}.${timestamp}.${rawBody.toString('utf8')}`;
    const expected = crypto
        .createHmac('sha256', Buffer.from(secretPart, 'base64'))
        .update(signedContent)
        .digest();

    const isValid = String(signatureHeader)
        .split(/\s+/)
        .filter(Boolean)
        .some(entry => {
            const [version, encodedSignature] = entry.split(',', 2);
            if (version !== 'v1' || !encodedSignature) return false;
            const received = Buffer.from(encodedSignature, 'base64');
            return received.length === expected.length && crypto.timingSafeEqual(received, expected);
        });

    if (!isValid) {
        throw new Error('Invalid Stitch webhook signature');
    }

    return JSON.parse(rawBody.toString('utf8'));
}

module.exports = {
    appendRedirectUri,
    createPaymentRequest,
    expressRequest,
    getClientToken,
    getConfigurationStatus,
    getPaymentRequest,
    registerRedirectUrl,
    validateCheckoutConfiguration,
    verifySvixWebhook
};
