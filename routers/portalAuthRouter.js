const express = require('express');
const crypto = require('crypto');
const { hash, safeRedirect, publicUser, fail } = require('../utils/portalPolicy');
const { readCookie, cookieOptions, sameOrigin } = require('../utils/portalSessions');

function createAuthRouter({ db, access, sessions, provider }) {
    const router = express.Router();
    const oauthCookie = process.env.NODE_ENV === 'production' ? '__Secure-proq_oauth' : 'proq_oauth';
    const callbackPath = '/api/auth/microsoft/callback';
    const wrap = work => (req, res, next) => Promise.resolve(work(req, res, next)).catch(next);
    router.use((req, res, next) => {
        res.set('Cache-Control', 'no-store');
        res.set('Referrer-Policy', 'no-referrer');
        next();
    });
    router.use(sameOrigin);

    router.get('/microsoft/signin', wrap(async (req, res) => {
        try {
            const state = crypto.randomBytes(32).toString('base64url');
            const browser = crypto.randomBytes(32).toString('base64url');
            const nonce = crypto.randomBytes(32).toString('base64url');
            const verifier = crypto.randomBytes(64).toString('base64url');
            const url = await provider.authorizationUrl(state, nonce, verifier);
            await db.query('DELETE FROM portal_oauth_states WHERE expires_at < ?', [new Date()]);
            await db.query('DELETE FROM portal_sessions WHERE expires_at < ?', [new Date()]);
            await db.query(`INSERT INTO portal_oauth_states
                (state_hash, browser_hash, nonce, verifier, redirect_path, expires_at) VALUES (?, ?, ?, ?, ?, ?)`,
            [hash(state), hash(browser), nonce, verifier, safeRedirect(req.query.redirect), new Date(Date.now() + 5 * 60 * 1000)]);
            res.cookie(oauthCookie, browser, { ...cookieOptions(callbackPath), maxAge: 5 * 60 * 1000 });
            res.redirect(url);
        } catch (error) {
            console.error('[Microsoft sign-in] Start failed:', error.code || error.name);
            res.redirect(`/signin.html?error=${error.code === 'not_configured' ? 'not_configured' : 'failed'}`);
        }
    }));

    router.get('/microsoft/callback', wrap(async (req, res) => {
        const browser = readCookie(req, oauthCookie);
        res.clearCookie(oauthCookie, cookieOptions(callbackPath));
        let connection;
        let stateRecord;
        try {
            if (typeof req.query.state !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(req.query.state) || !/^[A-Za-z0-9_-]{43}$/.test(browser)) {
                fail('Invalid sign-in state.', 400, 'invalid_request');
            }
            connection = await db.getConnection();
            await connection.beginTransaction();
            const [records] = await connection.query('SELECT * FROM portal_oauth_states WHERE state_hash = ? AND browser_hash = ? FOR UPDATE',
                [hash(req.query.state), hash(browser)]);
            stateRecord = records[0];
            if (!stateRecord || new Date(stateRecord.expires_at).getTime() <= Date.now()) fail('Expired sign-in.', 400, 'invalid_request');
            await connection.query('DELETE FROM portal_oauth_states WHERE state_hash = ?', [hash(req.query.state)]);
            await connection.commit();
            connection.release();
            connection = null;
            if (req.query.error) fail('Sign-in cancelled.', 400, 'cancelled');
            if (typeof req.query.code !== 'string' || !req.query.code || req.query.code.length > 12000) fail('Invalid sign-in code.', 400, 'invalid_request');
            const identity = await provider.exchange(req.query.code, stateRecord.verifier, stateRecord.nonce);
            const resolved = await access.resolveIdentity(identity);
            if (resolved.error) return res.redirect(`/signin.html?error=${resolved.error}`);
            await sessions.create(req, res, resolved.user);
            const target = resolved.user.role === 'admin' ? '/admin_dashboard.html' : safeRedirect(stateRecord.redirect_path);
            res.redirect(`/microsoft-auth-complete.html?redirect=${encodeURIComponent(target.startsWith('/admin_') && resolved.user.role !== 'admin' ? '/index.html' : target)}`);
        } catch (error) {
            if (connection) { await connection.rollback(); connection.release(); }
            console.error('[Microsoft sign-in] Callback failed:', error.code || error.name);
            const allowed = ['invalid_request', 'cancelled', 'not_configured'];
            res.redirect(`/signin.html?error=${allowed.includes(error.code) ? error.code : 'failed'}`);
        }
    }));

    router.get('/microsoft/complete', wrap(async (req, res) => {
        const user = await sessions.authenticate(req);
        res.json({ status: 'success', data: { user: publicUser(user), redirect: user.role === 'admin' ? '/admin_dashboard.html' : safeRedirect(req.query.redirect) } });
    }));
    router.get('/session', wrap(async (req, res) => {
        const user = await sessions.authenticate(req);
        res.json({ status: 'success', data: { user: publicUser(user), closedTabTimeoutSeconds: 600 } });
    }));
    router.post('/session/heartbeat', wrap(async (req, res) => {
        const user = await sessions.authenticate(req);
        await sessions.tab(req, req.body.tabId);
        res.json({ status: 'success', data: { user: publicUser(user) } });
    }));
    router.post('/session/close', wrap(async (req, res) => {
        await sessions.authenticate(req);
        await sessions.tab(req, req.body.tabId, true);
        res.status(204).end();
    }));
    router.post('/logout', wrap(async (req, res) => {
        await sessions.logout(req, res);
        res.status(204).end();
    }));
    return router;
}

module.exports = { createAuthRouter };
