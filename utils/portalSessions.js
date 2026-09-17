const crypto = require('crypto');
const { SESSION_IDLE_MS, hash, fail, assertAccess, sessionIsExpired } = require('./portalPolicy');

function readCookie(req, name) {
    const pair = String(req.headers.cookie || '').split(';').find(value => value.trim().startsWith(`${name}=`));
    if (!pair) return '';
    try { return decodeURIComponent(pair.trim().slice(name.length + 1)); } catch (_) { return ''; }
}

function cookieOptions(path = '/') {
    return { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path };
}

function createSessionService(db, access, clock = () => Date.now()) {
    const cookieName = process.env.NODE_ENV === 'production' ? '__Host-proq_session' : 'proq_session';
    function tokenHash(req) {
        const value = readCookie(req, cookieName);
        return /^[A-Za-z0-9_-]{43}$/.test(value) ? hash(value) : null;
    }
    async function create(req, res, user) {
        assertAccess(user);
        const previous = tokenHash(req);
        if (previous) await db.query('DELETE FROM portal_sessions WHERE token_hash = ?', [previous]);
        const token = crypto.randomBytes(32).toString('base64url');
        await db.query('INSERT INTO portal_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
            [hash(token), user.userID, new Date(clock() + SESSION_IDLE_MS)]);
        await db.query('UPDATE portal_user_access SET last_login_at = ? WHERE user_id = ?', [new Date(clock()), user.userID]);
        // Persistent cookie permits reopening within ten minutes; server expiry is authoritative.
        res.cookie(cookieName, token, { ...cookieOptions(), maxAge: 30 * 24 * 60 * 60 * 1000 });
    }
    async function authenticate(req) {
        if (req.portalSession && req.user) return req.user;
        const token = tokenHash(req);
        if (!token) fail('Sign in with Microsoft to continue.', 401, 'session_expired');
        const [rows] = await db.query('SELECT user_id, expires_at FROM portal_sessions WHERE token_hash = ?', [token]);
        if (!rows[0] || sessionIsExpired(rows[0].expires_at, clock())) {
            if (rows[0]) await db.query('DELETE FROM portal_sessions WHERE token_hash = ?', [token]);
            fail('Your session has expired. Sign in again.', 401, 'session_expired');
        }
        const user = await access.getUser(rows[0].user_id);
        assertAccess(user);
        req.portalSession = token;
        req.user = user;
        return user;
    }
    async function tab(req, tabId, closing = false) {
        if (typeof tabId !== 'string' || !/^[A-Za-z0-9_-]{16,80}$/.test(tabId)) fail('Invalid browser tab identifier.');
        const token = req.portalSession || tokenHash(req);
        if (!token) fail('Your session has expired.', 401, 'session_expired');
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
            const [rows] = await connection.query('SELECT expires_at FROM portal_sessions WHERE token_hash = ? FOR UPDATE', [token]);
            const now = clock();
            if (!rows[0] || sessionIsExpired(rows[0].expires_at, now)) fail('Your session has expired.', 401, 'session_expired');
            if (closing) {
                const [removed] = await connection.query('DELETE FROM portal_session_tabs WHERE token_hash = ? AND tab_id = ?', [token, tabId]);
                const [open] = await connection.query('SELECT COUNT(*) AS count FROM portal_session_tabs WHERE token_hash = ? AND seen_at > ?',
                    [token, new Date(now - 2 * 60 * 1000)]);
                // Repeated/missing-tab beacons must never extend the closed session.
                if (removed.affectedRows && !Number(open[0].count)) {
                    await connection.query('UPDATE portal_sessions SET expires_at = ? WHERE token_hash = ?', [new Date(now + SESSION_IDLE_MS), token]);
                }
            } else {
                await connection.query('DELETE FROM portal_session_tabs WHERE token_hash = ? AND seen_at < ?', [token, new Date(now - SESSION_IDLE_MS)]);
                await connection.query(`INSERT INTO portal_session_tabs (token_hash, tab_id, seen_at) VALUES (?, ?, ?)
                    ON DUPLICATE KEY UPDATE seen_at = VALUES(seen_at)`, [token, tabId, new Date(now)]);
                await connection.query('UPDATE portal_sessions SET expires_at = ? WHERE token_hash = ?', [new Date(now + SESSION_IDLE_MS), token]);
            }
            await connection.commit();
        } catch (error) { await connection.rollback(); throw error; }
        finally { connection.release(); }
    }
    async function logout(req, res) {
        const token = tokenHash(req);
        if (token) await db.query('DELETE FROM portal_sessions WHERE token_hash = ?', [token]);
        res.clearCookie(cookieName, cookieOptions());
    }
    return { create, authenticate, tab, logout, tokenHash, cookieName };
}

function sameOrigin(req, res, next) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    let allowed;
    try { allowed = new URL(process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`).origin; }
    catch (_) { return res.status(503).json({ status: 'error', message: 'Public site URL is not configured.' }); }
    let origin = req.get('origin');
    if (!origin && req.get('referer')) {
        try { origin = new URL(req.get('referer')).origin; } catch (_) { origin = ''; }
    }
    if (origin !== allowed || req.get('sec-fetch-site') === 'cross-site') {
        return res.status(403).json({ status: 'error', message: 'This request must come from the ProQ Pilot website.' });
    }
    next();
}

module.exports = { createSessionService, readCookie, cookieOptions, sameOrigin };
