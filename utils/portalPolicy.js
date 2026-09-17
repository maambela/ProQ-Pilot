const crypto = require('crypto');

const SESSION_IDLE_MS = 10 * 60 * 1000;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(message, statusCode = 400, code) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.code = code;
    throw error;
}

function id(value, label = 'ID') {
    const result = Number(value);
    if (!Number.isSafeInteger(result) || result <= 0) fail(`${label} must be a positive integer.`);
    return result;
}

function guid(value, label, optional = false) {
    const result = String(value || '').trim().toLowerCase();
    if (optional && !result) return null;
    if (!GUID.test(result)) fail(`${label} must be a valid Microsoft GUID.`);
    return result;
}

function text(value, label, max, required = false) {
    if (value != null && typeof value !== 'string') fail(`${label} must be text.`);
    const result = String(value || '').trim();
    if ((required && !result) || result.length > max) fail(`${label} is required and must be at most ${max} characters.`);
    return result;
}

function choice(value, choices, label) {
    if (!choices.includes(value)) fail(`Invalid ${label}.`);
    return value;
}

function boolean(value, defaultValue = true) {
    if (value === undefined) return defaultValue;
    if (typeof value !== 'boolean') fail('Purchase permission must be true or false.');
    return value;
}

function hash(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }

// Only known application pages can be used as post-login destinations.
const DESTINATIONS = new Set(['index.html', 'store.html', 'kit.html', 'cart.html', 'checkout.html',
    'product.html', 'wishlist.html', 'my-account.html', 'user-orders.html', 'order-details.html',
    'order-success.html', 'my-duo-accounts.html', 'duo-store.html', 'contact.html', 'review.html',
    'admin_dashboard.html', 'admin_products.html', 'admin_core_products.html',
    'admin_companies.html', 'admin_users.html']);

function safeRedirect(value, fallback = '/index.html') {
    if (typeof value !== 'string' || /[\\\r\n]/.test(value)) return fallback;
    try {
        const url = new URL(value, 'https://portal.invalid/');
        if (url.origin !== 'https://portal.invalid' || !DESTINATIONS.has(url.pathname.slice(1))) return fallback;
        return `${url.pathname}${url.search}`.slice(0, 500);
    } catch (_) { return fallback; }
}

function assertAccess(user) {
    if (!user || user.accessStatus !== 'approved' || user.companyStatus !== 'active' ||
        !user.microsoftObjectId || !Number(user.isActive)) {
        fail('Your platform access is disabled or awaiting approval.', 403, 'access_disabled');
    }
    if (user.role === 'admin' && user.companyType !== 'admin') {
        fail('Administrator access is unavailable for this company.', 403, 'access_disabled');
    }
    if (!['admin', 'client'].includes(user.role)) fail('Invalid platform role.', 403, 'access_disabled');
}

function publicUser(user) {
    return {
        userID: user.userID, firstName: user.firstName, lastName: user.lastName,
        email: user.email, contact: user.contact || '', role: user.role,
        companyId: user.companyId, companyName: user.companyName,
        canPurchase: user.role === 'admin' || Boolean(user.canPurchase), accessStatus: user.accessStatus
    };
}

function sessionIsExpired(expiresAt, now = Date.now()) {
    return !expiresAt || new Date(expiresAt).getTime() <= now;
}

module.exports = { SESSION_IDLE_MS, GUID, fail, id, guid, text, choice, boolean, hash,
    safeRedirect, assertAccess, publicUser, sessionIsExpired };
