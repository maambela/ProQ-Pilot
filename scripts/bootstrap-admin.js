require('dotenv').config({ quiet: true });
const db = require('../utils/db');
const { createAccessService } = require('../utils/portalAccess');

createAccessService(db).bootstrap({
    tenantId: process.env.PORTAL_BOOTSTRAP_TENANT_ID,
    objectId: process.env.PORTAL_BOOTSTRAP_OBJECT_ID,
    email: process.env.PORTAL_BOOTSTRAP_EMAIL,
    companyName: process.env.PORTAL_BOOTSTRAP_COMPANY_NAME,
    firstName: process.env.PORTAL_BOOTSTRAP_FIRST_NAME,
    lastName: process.env.PORTAL_BOOTSTRAP_LAST_NAME
}).then(() => console.log('Initial administrator created. Sign in with the configured Microsoft work account.'))
    .catch(error => { console.error('Administrator setup failed:', error.statusCode ? error.message : error.code || 'database error'); process.exitCode = 1; })
    .finally(() => db.end());
