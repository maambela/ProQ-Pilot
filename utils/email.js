const axios = require('axios');

const EMAIL_SENDERS = {
    sales: process.env.EMAIL_SALES_FROM || 'sales@stackopsit.co.za',
    support: process.env.EMAIL_SUPPORT_FROM || 'support@stackopsit.co.za',
    noreply: process.env.EMAIL_NOREPLY_FROM || 'noreply@stackopsit.co.za'
};

const ORDER_NOTIFICATION_RECIPIENTS = [
    'maambelanduni@stackopsit.co.za',
    'sales@stackopsit.co.za'
];

let graphTokenCache = {
    token: null,
    expiresAt: 0
};

function normalizeRecipients(value) {
    if (!value) return [];
    const values = Array.isArray(value) ? value : String(value).split(',');
    return values
        .map(item => {
            if (typeof item === 'string') return item.trim();
            return item?.email || item?.address || item?.emailAddress?.address || '';
        })
        .filter(Boolean)
        .map(address => ({ emailAddress: { address } }));
}

function resolveGraphCredentials() {
    const tenantId = process.env.AZURE_TENANT_ID || process.env.MICROSOFT_TENANT_ID || process.env.MS_TENANT_ID;
    const clientId = process.env.AZURE_CLIENT_ID || process.env.MICROSOFT_CLIENT_ID || process.env.MS_CLIENT_ID;
    const clientSecret = process.env.AZURE_CLIENT_SECRET || process.env.MICROSOFT_CLIENT_SECRET || process.env.MS_CLIENT_SECRET;

    if (!tenantId || !clientId || !clientSecret) {
        throw new Error('Missing Microsoft Graph credentials. Set AZURE_TENANT_ID, AZURE_CLIENT_ID, and AZURE_CLIENT_SECRET.');
    }

    return { tenantId, clientId, clientSecret };
}

async function getGraphAccessToken() {
    if (graphTokenCache.token && graphTokenCache.expiresAt > Date.now()) {
        return graphTokenCache.token;
    }

    const { tenantId, clientId, clientSecret } = resolveGraphCredentials();
    const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

    const response = await axios.post(
        tokenUrl,
        new URLSearchParams({
            client_id: clientId,
            scope: 'https://graph.microsoft.com/.default',
            client_secret: clientSecret,
            grant_type: 'client_credentials'
        }).toString(),
        {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 10000
        }
    );

    graphTokenCache = {
        token: response.data.access_token,
        expiresAt: Date.now() + ((response.data.expires_in || 3600) * 1000) - 60000
    };

    return graphTokenCache.token;
}

function extractEmailAddress(from) {
    if (!from) return null;
    const value = String(from);
    const match = value.match(/<([^>]+)>/);
    return (match ? match[1] : value).trim();
}

async function sendGraphEmail({
    to,
    cc,
    bcc,
    subject,
    html,
    text,
    from = EMAIL_SENDERS.support,
    replyTo,
    saveToSentItems = false
}) {
    const fromAddress = extractEmailAddress(from) || EMAIL_SENDERS.support;
    const toRecipients = normalizeRecipients(to);

    if (!toRecipients.length) {
        throw new Error('No email recipients supplied');
    }

    const token = await getGraphAccessToken();
    const message = {
        subject,
        body: {
            contentType: html ? 'HTML' : 'Text',
            content: html || text || ''
        },
        toRecipients
    };

    const ccRecipients = normalizeRecipients(cc);
    const bccRecipients = normalizeRecipients(bcc);
    const replyToRecipients = normalizeRecipients(replyTo);

    if (ccRecipients.length) message.ccRecipients = ccRecipients;
    if (bccRecipients.length) message.bccRecipients = bccRecipients;
    if (replyToRecipients.length) message.replyTo = replyToRecipients;

    await axios.post(
        `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(fromAddress)}/sendMail`,
        {
            message,
            saveToSentItems
        },
        {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            timeout: 15000
        }
    );

    return {
        messageId: `graph-${Date.now()}`,
        accepted: toRecipients.map(recipient => recipient.emailAddress.address)
    };
}

async function sendMailOptions(mailOptions = {}) {
    return sendGraphEmail({
        from: mailOptions.from || EMAIL_SENDERS.support,
        to: mailOptions.to,
        cc: mailOptions.cc,
        bcc: mailOptions.bcc,
        replyTo: mailOptions.replyTo,
        subject: mailOptions.subject,
        html: mailOptions.html,
        text: mailOptions.text
    });
}

async function sendEmail(options = {}) {
    try {
        const result = await sendGraphEmail({
            from: options.from || EMAIL_SENDERS.support,
            to: options.email || options.to,
            cc: options.cc,
            bcc: options.bcc,
            replyTo: options.replyTo,
            subject: options.subject,
            html: options.html,
            text: options.text
        });
        console.log('[EMAIL] ✅ Email sent successfully to:', options.email || options.to);
        return result;
    } catch (error) {
        console.error('[EMAIL] ❌ Failed to send email:', error.message);
        throw error;
    }
}

async function sendSalesEmail(options = {}) {
    return sendEmail({ ...options, from: EMAIL_SENDERS.sales });
}

async function sendSupportEmail(options = {}) {
    return sendEmail({ ...options, from: EMAIL_SENDERS.support });
}

async function sendNoReplyEmail(options = {}) {
    return sendEmail({ ...options, from: EMAIL_SENDERS.noreply });
}

async function sendOrderNotificationEmail(options = {}) {
    return sendSalesEmail({
        ...options,
        to: options.to || ORDER_NOTIFICATION_RECIPIENTS
    });
}

async function verifyGraphEmailConfig() {
    await getGraphAccessToken();
    return true;
}

module.exports = sendEmail;
module.exports.EMAIL_SENDERS = EMAIL_SENDERS;
module.exports.ORDER_NOTIFICATION_RECIPIENTS = ORDER_NOTIFICATION_RECIPIENTS;
module.exports.sendGraphEmail = sendGraphEmail;
module.exports.sendMailOptions = sendMailOptions;
module.exports.sendSalesEmail = sendSalesEmail;
module.exports.sendSupportEmail = sendSupportEmail;
module.exports.sendNoReplyEmail = sendNoReplyEmail;
module.exports.sendOrderNotificationEmail = sendOrderNotificationEmail;
module.exports.verifyGraphEmailConfig = verifyGraphEmailConfig;
