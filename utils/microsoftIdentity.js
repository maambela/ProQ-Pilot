const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { GUID, fail } = require('./portalPolicy');

function configuration() {
    const clientId = String(process.env.ENTRA_PORTAL_CLIENT_ID || process.env.AZURE_CLIENT_ID || process.env.MICROSOFT_CLIENT_ID || '').trim();
    const clientSecret = String(process.env.ENTRA_PORTAL_CLIENT_SECRET || process.env.AZURE_CLIENT_SECRET || process.env.MICROSOFT_CLIENT_SECRET || '').trim();
    const configuredRedirect = String(process.env.ENTRA_PORTAL_REDIRECT_URI || '').trim();
    const baseUrl = String(process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
    const redirectUri = configuredRedirect || (baseUrl ? `${baseUrl}/api/auth/microsoft/callback` : '');
    if (!GUID.test(clientId) || !clientSecret || !redirectUri) fail('Microsoft sign-in is not configured.', 503, 'not_configured');
    let url;
    try { url = new URL(redirectUri); } catch (_) { fail('Invalid Microsoft callback URL.', 503, 'not_configured'); }
    if (url.pathname !== '/api/auth/microsoft/callback' || url.search || url.hash || url.username || url.password ||
        (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) {
        fail('Invalid Microsoft callback URL.', 503, 'not_configured');
    }
    return { clientId, clientSecret, redirectUri };
}

function createMicrosoftProvider(fetcher = global.fetch, clock = () => Date.now()) {
    let metadataCache;
    let keysCache;
    async function json(url, options) {
        const response = await fetcher(url, { ...options, signal: AbortSignal.timeout(10000) });
        if (!response.ok) fail('Microsoft sign-in is temporarily unavailable.', 502, 'failed');
        return response.json();
    }
    async function metadata() {
        if (metadataCache && metadataCache.expires > clock()) return metadataCache.data;
        const data = await json('https://login.microsoftonline.com/organizations/v2.0/.well-known/openid-configuration');
        for (const key of ['authorization_endpoint', 'token_endpoint', 'jwks_uri']) {
            const url = new URL(data[key]);
            if (url.origin !== 'https://login.microsoftonline.com') fail('Invalid Microsoft discovery metadata.', 502);
        }
        if (data.issuer !== 'https://login.microsoftonline.com/{tenantid}/v2.0') fail('Invalid Microsoft token issuer metadata.', 502);
        metadataCache = { data, expires: clock() + 60 * 60 * 1000 };
        return data;
    }
    async function keys(force = false) {
        if (!force && keysCache && keysCache.expires > clock()) return keysCache.data;
        const discovery = await metadata();
        const data = await json(discovery.jwks_uri);
        if (!Array.isArray(data.keys)) fail('Invalid Microsoft signing keys.', 502);
        keysCache = { data: data.keys, expires: clock() + 60 * 60 * 1000 };
        return data.keys;
    }
    async function validate(idToken, config, nonce) {
        const decoded = jwt.decode(idToken, { complete: true });
        if (!decoded || decoded.header.alg !== 'RS256' || !decoded.header.kid || !GUID.test(decoded.payload.tid || '')) {
            fail('Invalid Microsoft identity token.', 401);
        }
        const tenantId = decoded.payload.tid.toLowerCase();
        const issuer = `https://login.microsoftonline.com/${tenantId}/v2.0`;
        let signingKeys = await keys();
        if (!signingKeys.some(key => key.kid === decoded.header.kid)) signingKeys = await keys(true);
        const key = signingKeys.find(item => item.kid === decoded.header.kid && item.kty === 'RSA' && item.use === 'sig' &&
            (!item.alg || item.alg === 'RS256'));
        if (!key) fail('Microsoft signing key issuer does not match.', 401);
        const publicKey = crypto.createPublicKey({ key, format: 'jwk' });
        const claims = jwt.verify(idToken, publicKey, {
            algorithms: ['RS256'], audience: config.clientId, issuer, clockTimestamp: Math.floor(clock() / 1000), clockTolerance: 30
        });
        const returnedNonce = Buffer.from(String(claims.nonce || ''));
        const expectedNonce = Buffer.from(String(nonce || ''));
        if (!Number.isFinite(claims.exp) || !GUID.test(claims.oid || '') || claims.tid !== tenantId ||
            !nonce || returnedNonce.length !== expectedNonce.length || !crypto.timingSafeEqual(returnedNonce, expectedNonce)) {
            fail('Invalid Microsoft identity claims.', 401);
        }
        return claims;
    }
    async function authorizationUrl(state, nonce, verifier) {
        const config = configuration();
        const discovery = await metadata();
        const url = new URL(discovery.authorization_endpoint);
        url.search = new URLSearchParams({ client_id: config.clientId, response_type: 'code', redirect_uri: config.redirectUri,
            response_mode: 'query', scope: 'openid profile email', state, nonce, prompt: 'select_account',
            code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' }).toString();
        return url.toString();
    }
    async function exchange(code, verifier, nonce) {
        const config = configuration();
        const discovery = await metadata();
        const response = await json(discovery.token_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret,
                grant_type: 'authorization_code', code, redirect_uri: config.redirectUri, code_verifier: verifier }).toString() });
        if (!response.id_token) fail('Microsoft did not return an identity token.', 401);
        return validate(response.id_token, config, nonce);
    }
    return { authorizationUrl, exchange, validate };
}

module.exports = { createMicrosoftProvider, configuration };
