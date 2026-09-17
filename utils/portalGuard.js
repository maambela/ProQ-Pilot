const { fail } = require('./portalPolicy');
const { sameOrigin } = require('./portalSessions');

function createPortalGuard(db, sessions) {
    const legacyAuth = /^\/users\/(?:signup|login|forgot-password|reset-password(?:\/[^/]+)?|verify-email(?:\/[^/]+)?)\/?$/;
    const adminPath = /^\/(?:admin(?:\/|$)|sync-|core-products(?:\/|$)|core-status$|tarson-status$|stitch-status$|debug(?:\/|$)|microsoft\/token-status$|duo\/test-api$)/;
    const checkoutPath = /^\/(?:stitch-checkout|payfast-checkout|checkout-payment|checkout)\/?$/;

    function guard(req, res, next) {
        try { req.portalPath = decodeURIComponent(req.path); } catch (_) { return res.sendStatus(400); }
        if (/[\\]/.test(req.portalPath) || req.portalPath.split('/').includes('..')) return res.sendStatus(400);
        if (legacyAuth.test(req.portalPath)) return res.status(410).json({ status: 'error', message: 'Use Microsoft sign-in. Access is managed by your ProQ Pilot administrator.' });
        // Provider return verification and the public contact form do not grant platform access.
        if (req.path === '/stitch-payment/verify' && req.method === 'GET') return next();
        if (req.path === '/contact' && req.method === 'POST') return sameOrigin(req, res, next);
        sameOrigin(req, res, () => authorize(req, res).then(() => next()).catch(next));
    }

    async function authorize(req, res) {
        const user = await sessions.authenticate(req);
        const routePath = req.portalPath;
        res.set('Cache-Control', 'no-store');
        const admin = user.role === 'admin';
        if ((adminPath.test(routePath) || (routePath.startsWith('/products') && !['GET', 'HEAD'].includes(req.method))) && !admin) {
            fail('Administrator access is required.', 403);
        }
        const purchasing = checkoutPath.test(routePath) || /^\/duo\/(?:create-account|upgrade-license)$/.test(routePath);
        if (purchasing && user.role !== 'admin' && !user.canPurchase) fail('Purchasing is disabled for your account. Contact your administrator.', 403);

        function own(value) {
            if (value === undefined || value === null || value === '') return;
            if ((!admin || purchasing) && Number(value) !== Number(user.userID)) fail('You cannot access another customer’s account.', 403);
        }
        own(req.body?.userID); own(req.body?.userId); own(req.query?.userID); own(req.query?.userId);
        if (checkoutPath.test(routePath)) req.body.userID = user.userID;
        if (/^\/duo\/(?:create-account|upgrade-license)$/.test(routePath)) req.body.userId = user.userID;
        const ownershipPatterns = [
            /^\/cart\/(\d+)(?:\/|$)/,
            /^\/wishlist\/(?:count\/|check\/)(\d+)(?:\/|$)/,
            /^\/users\/(\d+)\/?$/,
            /^\/orders\/user\/(\d+)\/?$/,
            /^\/duo\/(?:organizations\/)?(\d+)\/?$/
        ];
        if (req.method === 'GET') ownershipPatterns.push(/^\/wishlist\/(\d+)\/?$/, /^\/addresses\/(\d+)\/?$/);
        for (const expression of ownershipPatterns) {
            const match = routePath.match(expression);
            if (match) own(match[1]);
        }
        if (!admin) {
            const address = routePath.match(/^\/addresses\/(\d+)\/?$/);
            if (address && ['PUT', 'DELETE', 'PATCH'].includes(req.method)) await resource('Addresses', 'id', 'userID', address[1], user.userID);
            const order = routePath.match(/^\/orders\/(\d+)\/?$/);
            if (order) await resource('Orders', 'id', 'userID', order[1], user.userID);
            const duo = routePath.match(/^\/duo\/organization\/(\d+)\/?$/);
            if (duo) await resource('duo_organizations', 'id', 'customer_id', duo[1], user.userID);
        }
        if (purchasing && req.body.addressID) await resource('Addresses', 'id', 'userID', req.body.addressID, user.userID);
        if (/^\/duo\/(?:create-account|upgrade-license)$/.test(routePath)) {
            const [payments] = await db.query('SELECT userID FROM Orders WHERE reference = ? AND userID = ?', [req.body.payment_reference || '', user.userID]);
            if (!payments.length) fail('Payment does not belong to your account.', 403);
        }
    }

    async function resource(table, key, owner, resourceID, userID) {
        // All identifiers below are fixed constants supplied by this module.
        const [rows] = await db.query(`SELECT ${key} FROM ${table} WHERE ${key} = ? AND ${owner} = ?`, [resourceID, userID]);
        if (!rows.length) fail('This record is not available to your account.', 404);
    }

    return guard;
}

module.exports = { createPortalGuard };
