const db = require('./db');
const { createAccessService } = require('./portalAccess');
const { createSessionService } = require('./portalSessions');
const { createMicrosoftProvider } = require('./microsoftIdentity');

const access = createAccessService(db);
const sessions = createSessionService(db, access);
const provider = createMicrosoftProvider();
module.exports = { db, access, sessions, provider };
