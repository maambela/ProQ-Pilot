const express = require('express');

function createAdminRouter(access) {
    const router = express.Router();
    const endpoint = (work, statusCode = 200) => (req, res, next) => {
        Promise.resolve().then(() => work(req)).then(data => res.status(statusCode).json({ status: 'success', data })).catch(next);
    };
    router.get('/access', endpoint(() => access.list()));
    router.post('/companies', endpoint(req => access.saveCompany(req.user, null, req.body), 201));
    router.patch('/companies/:id', endpoint(req => access.saveCompany(req.user, req.params.id, req.body)));
    router.post('/users', endpoint(req => access.saveUser(req.user, null, req.body), 201));
    router.patch('/users/:id', endpoint(req => access.saveUser(req.user, req.params.id, req.body)));
    router.post('/users/:id/revoke-sessions', endpoint(req => access.revokeUserSessions(req.user, req.params.id)));
    router.post('/access-requests/:id/approve', endpoint(req => access.decideRequest(req.user, req.params.id, true, req.body)));
    router.post('/access-requests/:id/reject', endpoint(req => access.decideRequest(req.user, req.params.id, false)));
    return router;
}

module.exports = { createAdminRouter };
