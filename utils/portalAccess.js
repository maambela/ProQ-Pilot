const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const validator = require('validator');
const policy = require('./portalPolicy');

const USER_SELECT = `SELECT u.userID, u.firstName, u.lastName, u.email, u.contact, u.role, u.isActive,
    a.company_id AS companyId, a.microsoft_object_id AS microsoftObjectId,
    COALESCE(a.status, 'pending') AS accessStatus, COALESCE(a.can_purchase, 0) AS canPurchase,
    a.last_login_at AS lastLoginAt, c.name AS companyName, c.tenant_id AS microsoftTenantId,
    c.status AS companyStatus, c.type AS companyType
    FROM users u LEFT JOIN portal_user_access a ON a.user_id = u.userID
    LEFT JOIN portal_companies c ON c.id = a.company_id`;

function email(value, required = true) {
    const result = policy.text(value, 'Email', 254, required).toLowerCase();
    if (result && !validator.isEmail(result)) policy.fail('Enter a valid contact email address.');
    return result;
}

function createAccessService(db) {
    async function transaction(work) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
            await connection.query('SELECT id FROM portal_access_lock WHERE id = 1 FOR UPDATE');
            const result = await work(connection);
            await connection.commit();
            return result;
        } catch (error) {
            await connection.rollback();
            if (error.code === 'ER_DUP_ENTRY') policy.fail('That email, tenant or Microsoft user is already registered.', 409);
            throw error;
        } finally { connection.release(); }
    }

    async function getUser(userID, connection = db) {
        const [rows] = await connection.query(`${USER_SELECT} WHERE u.userID = ?`, [userID]);
        return rows[0] || null;
    }

    async function company(companyID, connection = db) {
        const [rows] = await connection.query(`SELECT id, name, tenant_id AS tenantId, type, status,
            contact_email AS contactEmail, notes FROM portal_companies WHERE id = ?`, [companyID]);
        if (!rows[0]) policy.fail('Company not found.', 404);
        return rows[0];
    }

    async function audit(connection, actor, action, targetType, targetId, details = {}) {
        await connection.query(`INSERT INTO portal_access_audit
            (actor_user_id, actor_email, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?, ?)`,
        [actor?.userID || null, actor?.email || 'bootstrap', action, targetType, targetId, JSON.stringify(details)]);
    }

    async function requireAdmin(actor, connection) {
        const fresh = await getUser(actor?.userID, connection);
        policy.assertAccess(fresh);
        if (fresh.role !== 'admin') policy.fail('Administrator access is required.', 403);
        return fresh;
    }

    async function ensureAdminRemains(connection) {
        const [rows] = await connection.query(`SELECT COUNT(*) AS count FROM users u
            JOIN portal_user_access a ON a.user_id = u.userID JOIN portal_companies c ON c.id = a.company_id
            WHERE u.role = 'admin' AND u.isActive = 1 AND a.status = 'approved'
            AND a.microsoft_object_id IS NOT NULL AND c.type = 'admin' AND c.status = 'active'`);
        if (!Number(rows[0].count)) policy.fail('Keep at least one active, approved platform administrator.', 409);
    }

    async function revoke(connection, userID) {
        await connection.query('DELETE FROM portal_sessions WHERE user_id = ?', [userID]);
    }

    async function list() {
        const [companies] = await db.query(`SELECT c.id, c.name, c.tenant_id AS tenantId, c.type, c.status,
            c.contact_email AS contactEmail, c.notes,
            (SELECT COUNT(*) FROM portal_user_access a WHERE a.company_id = c.id) AS userCount
            FROM portal_companies c ORDER BY c.name, c.id`);
        const [users] = await db.query(`${USER_SELECT} ORDER BY u.firstName, u.lastName, u.userID`);
        const [requests] = await db.query(`SELECT r.id, r.company_id AS companyId, c.name AS companyName,
            c.tenant_id AS tenantId, r.object_id AS objectId, r.email, r.display_name AS displayName,
            r.status, r.created_at AS createdAt FROM portal_access_requests r
            JOIN portal_companies c ON c.id = r.company_id WHERE r.status != 'approved'
            ORDER BY r.created_at DESC`);
        const [auditRows] = await db.query(`SELECT id, actor_email AS actorEmail, action, target_type AS targetType,
            target_id AS targetId, created_at AS createdAt FROM portal_access_audit ORDER BY id DESC LIMIT 100`);
        return { companies, users: users.map(u => ({ ...u, canPurchase: Boolean(u.canPurchase) })), requests, audit: auditRows };
    }

    async function saveCompany(actor, companyID, input) {
        return transaction(async connection => {
            const admin = await requireAdmin(actor, connection);
            const previous = companyID ? await company(policy.id(companyID), connection) : {};
            const value = { ...previous, ...input };
            const name = policy.text(value.name, 'Company name', 160, true);
            const tenantId = policy.guid(value.tenantId, 'Microsoft tenant ID');
            const type = policy.choice(value.type || 'client', ['admin', 'client'], 'company type');
            const status = policy.choice(value.status || 'active', ['active', 'suspended'], 'company status');
            const contactEmail = email(value.contactEmail, false);
            const notes = policy.text(value.notes, 'Notes', 4000);
            if (companyID && Number(admin.companyId) === Number(companyID) && (type !== 'admin' || status !== 'active')) {
                policy.fail('You cannot suspend or downgrade your own administrator company.', 409);
            }
            if (companyID && previous.tenantId !== tenantId) {
                const [linked] = await connection.query(`SELECT
                    (SELECT COUNT(*) FROM portal_user_access WHERE company_id = ?) +
                    (SELECT COUNT(*) FROM portal_access_requests WHERE company_id = ?) AS count`, [companyID, companyID]);
                if (Number(linked[0].count)) policy.fail('This company has linked users or requests. Create a new company for a different tenant.', 409);
            }
            if (companyID && type === 'client') {
                const [admins] = await connection.query(`SELECT COUNT(*) AS count FROM users u
                    JOIN portal_user_access a ON a.user_id = u.userID WHERE a.company_id = ? AND u.role = 'admin'`, [companyID]);
                if (Number(admins[0].count)) policy.fail('Change this company’s administrator users to client users before changing its type.', 409);
            }
            if (companyID) {
                await connection.query(`UPDATE portal_companies SET name = ?, tenant_id = ?, type = ?, status = ?,
                    contact_email = ?, notes = ? WHERE id = ?`, [name, tenantId, type, status, contactEmail, notes, companyID]);
                if (previous.status !== status || previous.type !== type || previous.tenantId !== tenantId) {
                    await connection.query(`DELETE s FROM portal_sessions s JOIN portal_user_access a ON a.user_id = s.user_id
                        WHERE a.company_id = ?`, [companyID]);
                }
                await ensureAdminRemains(connection);
            } else {
                const [result] = await connection.query(`INSERT INTO portal_companies
                    (name, tenant_id, type, status, contact_email, notes) VALUES (?, ?, ?, ?, ?, ?)`,
                [name, tenantId, type, status, contactEmail, notes]);
                companyID = result.insertId;
            }
            await audit(connection, admin, previous.id ? 'company.updated' : 'company.created', 'company', companyID, { name, type, status });
            return company(companyID, connection);
        });
    }

    async function writeUser(connection, userID, input) {
        const previous = userID ? await getUser(policy.id(userID), connection) : {};
        if (userID && !previous) policy.fail('User not found.', 404);
        const value = { ...previous, ...input };
        const companyId = policy.id(value.companyId, 'Company');
        const targetCompany = await company(companyId, connection);
        const firstName = policy.text(value.firstName, 'First name', 80, true);
        const lastName = policy.text(value.lastName, 'Last name', 80);
        const contact = policy.text(value.contact, 'Contact number', 40);
        const contactEmail = email(value.email);
        const role = policy.choice(value.role || 'client', ['admin', 'client'], 'user role');
        const accessStatus = policy.choice(value.accessStatus || 'pending', ['pending', 'approved', 'suspended'], 'access status');
        const canPurchase = role === 'admin' || policy.boolean(value.canPurchase === undefined ? undefined : Boolean(previous.userID) && input.canPurchase === undefined ? Boolean(value.canPurchase) : value.canPurchase);
        const microsoftObjectId = policy.guid(value.microsoftObjectId, 'Microsoft user object ID', true);
        if (role === 'admin' && targetCompany.type !== 'admin') policy.fail('Platform administrators must belong to an admin company.');
        if (accessStatus === 'approved' && !microsoftObjectId) policy.fail('An approved user needs their Microsoft object ID, or approve their verified sign-in request.');
        const [duplicate] = await connection.query('SELECT userID FROM users WHERE email = ? AND userID != ?', [contactEmail, userID || 0]);
        if (duplicate.length) policy.fail('This email already has an account. Edit or explicitly link the existing user instead.', 409);
        if (userID) {
            await connection.query('UPDATE users SET firstName = ?, lastName = ?, email = ?, contact = ?, role = ?, isActive = 1 WHERE userID = ?',
                [firstName, lastName, contactEmail, contact, role, userID]);
        } else {
            const unusablePassword = await bcrypt.hash(crypto.randomBytes(48).toString('base64url'), 12);
            const [result] = await connection.query(`INSERT INTO users
                (firstName, lastName, email, contact, role, password_hash, isActive) VALUES (?, ?, ?, ?, ?, ?, 1)`,
            [firstName, lastName, contactEmail, contact, role, unusablePassword]);
            userID = result.insertId;
        }
        const [assigned] = await connection.query('SELECT user_id FROM portal_user_access WHERE user_id = ?', [userID]);
        if (assigned.length) {
            await connection.query(`UPDATE portal_user_access SET company_id = ?, microsoft_object_id = ?, status = ?, can_purchase = ?
                WHERE user_id = ?`, [companyId, microsoftObjectId, accessStatus, canPurchase ? 1 : 0, userID]);
        } else {
            await connection.query(`INSERT INTO portal_user_access (user_id, company_id, microsoft_object_id, status, can_purchase)
                VALUES (?, ?, ?, ?, ?)`, [userID, companyId, microsoftObjectId, accessStatus, canPurchase ? 1 : 0]);
        }
        // Never transfer an identity between users through an email match.
        if (microsoftObjectId) {
            await connection.query(`UPDATE portal_access_requests SET status = 'approved'
                WHERE company_id = ? AND object_id = ?`, [companyId, microsoftObjectId]);
        }
        if (!previous.userID || Number(previous.companyId) !== companyId || previous.microsoftObjectId !== microsoftObjectId ||
            previous.role !== role || previous.accessStatus !== accessStatus || Boolean(previous.canPurchase) !== canPurchase) {
            await revoke(connection, userID);
        }
        return getUser(userID, connection);
    }

    async function saveUser(actor, userID, input) {
        return transaction(async connection => {
            const admin = await requireAdmin(actor, connection);
            if (Number(userID) === Number(admin.userID)) {
                if ((input.role !== undefined && input.role !== 'admin') ||
                    (input.accessStatus !== undefined && input.accessStatus !== 'approved') ||
                    (input.companyId !== undefined && Number(input.companyId) !== Number(admin.companyId)) ||
                    (input.microsoftObjectId !== undefined && String(input.microsoftObjectId).toLowerCase() !== admin.microsoftObjectId)) {
                    policy.fail('Another administrator must change your own role, status or Microsoft identity.', 409);
                }
            }
            const result = await writeUser(connection, userID, input);
            await ensureAdminRemains(connection);
            await audit(connection, admin, userID ? 'user.updated' : 'user.created', 'user', result.userID,
                { companyId: result.companyId, role: result.role, status: result.accessStatus, canPurchase: Boolean(result.canPurchase) });
            return { ...result, canPurchase: Boolean(result.canPurchase) };
        });
    }

    async function resolveIdentity(identity) {
        const tenantId = policy.guid(identity.tid, 'Tenant');
        const objectId = policy.guid(identity.oid, 'Microsoft user');
        return transaction(async connection => {
            const [companies] = await connection.query('SELECT id, status FROM portal_companies WHERE tenant_id = ?', [tenantId]);
            const targetCompany = companies[0];
            if (!targetCompany) return { error: 'company_not_approved' };
            if (targetCompany.status !== 'active') return { error: 'access_disabled' };
            const [users] = await connection.query(`${USER_SELECT} WHERE a.company_id = ? AND a.microsoft_object_id = ?`, [targetCompany.id, objectId]);
            if (users[0]) {
                try { policy.assertAccess(users[0]); } catch (error) { return { error: error.code || 'access_disabled' }; }
                return { user: users[0] };
            }
            const suggestedEmail = String(identity.email || identity.preferred_username || '').trim().toLowerCase();
            await connection.query(`INSERT INTO portal_access_requests (company_id, object_id, email, display_name)
                VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP(3)`,
            [targetCompany.id, objectId, validator.isEmail(suggestedEmail) ? suggestedEmail.slice(0, 254) : '', String(identity.name || '').slice(0, 200)]);
            const [requests] = await connection.query('SELECT status FROM portal_access_requests WHERE company_id = ? AND object_id = ?', [targetCompany.id, objectId]);
            return { error: requests[0].status === 'rejected' ? 'access_disabled' : 'pending_approval' };
        });
    }

    async function decideRequest(actor, requestID, approve, input = {}) {
        return transaction(async connection => {
            const admin = await requireAdmin(actor, connection);
            const [requests] = await connection.query('SELECT * FROM portal_access_requests WHERE id = ?', [policy.id(requestID)]);
            const request = requests[0];
            if (!request || request.status === 'approved') policy.fail('This request is no longer available.', 409);
            let result = null;
            if (approve) {
                const targetCompany = await company(request.company_id, connection);
                if (targetCompany.status !== 'active') policy.fail('Activate the company before approving users.', 409);
                const existing = input.userID ? await getUser(policy.id(input.userID), connection) : null;
                if (input.userID && (!existing || (existing.companyId && Number(existing.companyId) !== Number(request.company_id)))) {
                    policy.fail('Select an existing user assigned to this company, or an unassigned account.', 409);
                }
                if (existing && existing.microsoftObjectId && existing.microsoftObjectId !== request.object_id) {
                    policy.fail('That account is already linked to another Microsoft user. Edit its identity separately.', 409);
                }
                if (existing && Number(existing.userID) === Number(admin.userID)) policy.fail('You cannot relink your own administrator account.', 409);
                const parts = request.display_name.trim().split(/\s+/);
                result = await writeUser(connection, existing?.userID, {
                    firstName: existing?.firstName || input.firstName || parts[0] || 'Client',
                    lastName: existing?.lastName || input.lastName || parts.slice(1).join(' '),
                    email: existing?.email || input.email || request.email,
                    contact: existing?.contact || '', companyId: request.company_id,
                    role: input.role || 'client', accessStatus: 'approved',
                    canPurchase: policy.boolean(input.canPurchase), microsoftObjectId: request.object_id
                });
                await ensureAdminRemains(connection);
            }
            await connection.query('UPDATE portal_access_requests SET status = ? WHERE id = ?', [approve ? 'approved' : 'rejected', requestID]);
            await audit(connection, admin, approve ? 'request.approved' : 'request.rejected', 'request', requestID,
                { userID: result?.userID || null, linkedExisting: Boolean(input.userID) });
            return result ? { ...result, canPurchase: Boolean(result.canPurchase) } : { id: Number(requestID), status: 'rejected' };
        });
    }

    async function revokeUserSessions(actor, userID) {
        return transaction(async connection => {
            const admin = await requireAdmin(actor, connection);
            if (!await getUser(policy.id(userID), connection)) policy.fail('User not found.', 404);
            await revoke(connection, userID);
            await audit(connection, admin, 'user.sessions_revoked', 'user', userID);
            return { userID: Number(userID) };
        });
    }

    async function bootstrap(input) {
        return transaction(async connection => {
            const [rows] = await connection.query(`SELECT COUNT(*) AS count FROM users u JOIN portal_user_access a ON a.user_id = u.userID
                JOIN portal_companies c ON c.id = a.company_id WHERE u.role = 'admin' AND a.status = 'approved'
                AND c.type = 'admin' AND c.status = 'active' AND u.isActive = 1 AND a.microsoft_object_id IS NOT NULL`);
            if (Number(rows[0].count)) policy.fail('An active administrator already exists. Use the admin portal to manage access.', 409);
            const tenantId = policy.guid(input.tenantId, 'Bootstrap tenant ID');
            const objectId = policy.guid(input.objectId, 'Bootstrap user object ID');
            const contactEmail = email(input.email);
            const [companies] = await connection.query('SELECT id FROM portal_companies WHERE tenant_id = ?', [tenantId]);
            let companyID = companies[0]?.id;
            if (companyID) {
                await connection.query("UPDATE portal_companies SET type = 'admin', status = 'active' WHERE id = ?", [companyID]);
            } else {
                const [created] = await connection.query("INSERT INTO portal_companies (name, tenant_id, type, status, contact_email) VALUES (?, ?, 'admin', 'active', ?)",
                    [policy.text(input.companyName || 'ProQ Pilot', 'Company name', 160, true), tenantId, contactEmail]);
                companyID = created.insertId;
            }
            const [existing] = await connection.query('SELECT userID, firstName, lastName FROM users WHERE email = ?', [contactEmail]);
            const user = await writeUser(connection, existing[0]?.userID, {
                firstName: input.firstName || existing[0]?.firstName || 'Platform',
                lastName: input.lastName || existing[0]?.lastName || 'Administrator',
                email: contactEmail, companyId: companyID, role: 'admin', accessStatus: 'approved',
                canPurchase: true, microsoftObjectId: objectId
            });
            await audit(connection, null, 'administrator.bootstrapped', 'user', user.userID);
            return user;
        });
    }

    return { getUser, list, saveCompany, saveUser, resolveIdentity, decideRequest, revokeUserSessions, bootstrap };
}

module.exports = { createAccessService, USER_SELECT };
