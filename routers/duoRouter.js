/**
 * Duo Security API Routes
 * Handles Duo license creation, upgrades, and management
 * Integrates with Duo Accounts API and Admin API
 */

const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const duoApi = require('../utils/duoApi');
const catchAsync = require('../utils/catchAsync');
const { sendSupportEmail } = require('../utils/email');


/**
 * POST /api/v1/duo/create-account
 * Create a new Duo child account for a customer
 * 
 * Request body:
 * {
 *   organization_name: "My Company",
 *   user_limit: 5,
 *   admin_emails: ["admin1@example.com", "admin2@example.com"],
 *   payment_reference: "txn_12345",
 *   customer_email: "customer@example.com",
 *   userId: 123  // From authenticated session
 * }
 * 
 * Response:
 * {
 *   success: true,
 *   account_id: "DA9VZOC5X63I2W72NRP9",
 *   organization_name: "My Company",
 *   dashboard_url: "https://admin-12345.duosecurity.com",
 *   message: "Account created successfully"
 * }
 */
router.post('/create-account', catchAsync(async (req, res) => {
    const { organization_name, user_limit, admin_emails, payment_reference, customer_email, userId, edition } = req.body;

    // Validate required fields
    if (!organization_name || !user_limit || !admin_emails || admin_emails.length === 0) {
        return res.status(400).json({
            success: false,
            error: 'Missing required fields: organization_name, user_limit, admin_emails'
        });
    }

    if (!Array.isArray(admin_emails)) {
        return res.status(400).json({
            success: false,
            error: 'admin_emails must be an array'
        });
    }

    // Validate edition
    const validEditions = ['ENTERPRISE', 'PLATFORM', 'BEYOND'];
    const selectedEdition = edition || 'PLATFORM';  // Default to Advantage (PLATFORM)
    if (!validEditions.includes(selectedEdition)) {
        return res.status(400).json({
            success: false,
            error: 'Invalid edition. Must be ENTERPRISE, PLATFORM, or BEYOND'
        });
    }

    let connection;
    try {
        connection = await db.getConnection();

        // Step 1: Verify payment was successful (REQUIRED for post-payment flow)
        if (!payment_reference) {
            connection.release();
            return res.status(400).json({
                success: false,
                error: 'Payment reference required. Account creation must follow payment verification.'
            });
        }

        const [paymentCheck] = await connection.query(
            'SELECT * FROM orders WHERE reference = ? AND status = "completed" LIMIT 1',
            [payment_reference]
        );
        
        if (paymentCheck.length === 0) {
            connection.release();
            return res.status(402).json({
                success: false,
                error: 'Payment not verified. Please ensure payment was successful before creating account.'
            });
        }

        console.log(`[Duo API] Payment verified: ${payment_reference}. Creating account: ${organization_name}`);

        // Step 2: Call Duo Accounts API to create account
        console.log(`[Duo API] Creating account: ${organization_name}`);
        let duoAccount;
        let accountId, apiHostname;
        try {
            duoAccount = await duoApi.createDuoAccount(organization_name);
            accountId = duoAccount.account_id;
            apiHostname = duoAccount.api_hostname;
            console.log(`[Duo API] Account created successfully: ${accountId}`);
        } catch (duoError) {
            connection.release();
            console.error('[Duo API] Failed to create account:', duoError.message);
            return res.status(500).json({
                success: false,
                error: 'Failed to create Duo account: ' + duoError.message
            });
        }

        const integrationKey = duoAccount.integration_key || 'Not available yet';

        // Step 3: Set hard user limit via Duo Admin API (with rollback on failure)
        try {
            console.log(`[Duo API] Setting user limit to ${user_limit}`);
            await duoApi.updateHardUserLimit(accountId, apiHostname, user_limit);
            console.log(`[Duo API] User limit set successfully`);
        } catch (err) {
            console.error(`[Duo API] Failed to set user limit, attempting rollback...`, err.message);
            try {
                await duoApi.deleteAccount(accountId);
                console.log(`[Duo API] Rollback successful: Account ${accountId} deleted`);
            } catch (rollbackErr) {
                console.error(`[Duo API] CRITICAL: Rollback failed! Account ${accountId} may be orphaned:`, rollbackErr.message);
            }
            connection.release();
            return res.status(500).json({
                success: false,
                error: 'Failed to configure user limit: ' + err.message
            });
        }

        // Step 4: Create administrator accounts in Duo (non-critical)
        console.log(`[Duo API] Creating ${admin_emails.length} admin accounts`);
        for (const email of admin_emails) {
            try {
                await duoApi.createDuoAdministrator(accountId, apiHostname, email);
            } catch (err) {
                console.error(`Error creating admin ${email}:`, err.message);
                // Don't fail the whole request if one admin fails
            }
        }

        // Step 5: Set Duo Edition
        console.log(`[Duo API] Setting edition to ${selectedEdition}`);
        try {
            await duoApi.setEdition(accountId, apiHostname, selectedEdition);
        } catch (err) {
            console.error(`Warning: Could not set edition ${selectedEdition}:`, err.message);
            // Don't fail the whole request if edition setting fails
        }

        // Step 6: Store in database
        const [result] = await connection.query(
            `INSERT INTO duo_organizations 
             (customer_id, organization_name, duo_account_id, user_limit, admin_emails, api_hostname, integration_key, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
            [userId, organization_name, accountId, user_limit, JSON.stringify(admin_emails), apiHostname, integrationKey]
        );

        // Step 7: Send confirmation emails
        const adminText = admin_emails.join(', ');
        const editionDisplayName = {
            'ENTERPRISE': 'Enterprise',
            'PLATFORM': 'Advantage',
            'BEYOND': 'Beyond'
        }[selectedEdition] || selectedEdition;

        const emailContent = `
        <h2>Welcome to Cisco Duo Security!</h2>
        <p>Your organization has been successfully created with ProQ Pilot.</p>
        
        <h3>Organization Details:</h3>
        <ul>
            <li><strong>Organization:</strong> ${organization_name}</li>
            <li><strong>Edition:</strong> ${editionDisplayName}</li>
            <li><strong>Licensed Users:</strong> ${user_limit}</li>
            <li><strong>Account ID:</strong> ${accountId}</li>
            <li><strong>Administrators:</strong> ${adminText}</li>
        </ul>
        
        <h3>Next Steps:</h3>
        <ol>
            <li>Log in to your Duo admin dashboard</li>
            <li>Configure your security policies</li>
            <li>Add your team members</li>
            <li>Enable multi-factor authentication</li>
            <li>Test with a pilot group</li>
        </ol>
        
        <p><strong>Support:</strong> Our team is available 24/7 for assistance.</p>
        `;

        for (const email of admin_emails) {
            try {
                await sendSupportEmail({
                    to: email,
                    subject: `Duo Security Account Created: ${organization_name}`,
                    html: emailContent
                });
                console.log(`[Email] Sent confirmation to ${email}`);
            } catch (err) {
                console.error(`Error sending email to ${email}:`, err.message);
            }
        }

        connection.release();

        res.status(201).json({
            success: true,
            message: 'Duo account created successfully',
            account_id: accountId,
            organization_name,
            user_limit,
            api_hostname: apiHostname,
            dashboard_url: `https://admin-${accountId}.duosecurity.com`
        });

    } catch (error) {
        if (connection) connection.release();
        console.error('[Duo API Error]', error.message);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to create Duo account'
        });
    }
}));


/**
 * POST /api/v1/duo/upgrade-license
 * Upgrade an existing Duo organization with more users
 * 
 * Request body:
 * {
 *   duo_org_id: 123,
 *   new_user_limit: 10,
 *   payment_reference: "txn_67890",
 *   userId: 456
 * }
 */
router.post('/upgrade-license', catchAsync(async (req, res) => {
    const { duo_org_id, new_user_limit, payment_reference, userId } = req.body;

    if (!duo_org_id || !new_user_limit) {
        return res.status(400).json({
            success: false,
            error: 'Missing required fields: duo_org_id, new_user_limit'
        });
    }

    let connection;
    try {
        connection = await db.getConnection();

        // Step 1: Find organization (verify ownership)
        const [orgs] = await connection.query(
            'SELECT * FROM duo_organizations WHERE id = ? AND customer_id = ?',
            [duo_org_id, userId]
        );

        if (orgs.length === 0) {
            connection.release();
            return res.status(404).json({
                success: false,
                error: 'Duo organization not found or you do not have permission'
            });
        }

        const duoOrg = orgs[0];
        const oldLimit = duoOrg.user_limit;

        // Step 2: Verify payment
        if (payment_reference) {
            const [paymentCheck] = await connection.query(
                'SELECT * FROM orders WHERE reference = ? AND status = "completed" LIMIT 1',
                [payment_reference]
            );
            
            if (paymentCheck.length === 0) {
                connection.release();
                return res.status(400).json({
                    success: false,
                    error: 'Payment reference not found or not completed'
                });
            }
        }

        // Step 3: Update Duo hard user limit
        console.log(`[Duo API] Upgrading user limit from ${oldLimit} to ${new_user_limit}`);
        await duoApi.updateHardUserLimit(
            duoOrg.duo_account_id,
            duoOrg.api_hostname,
            new_user_limit
        );

        // Step 4: Update database
        await connection.query(
            'UPDATE duo_organizations SET user_limit = ? WHERE id = ?',
            [new_user_limit, duo_org_id]
        );

        // Step 5: Send confirmation email
        const adminEmails = JSON.parse(duoOrg.admin_emails || '[]');
        const emailContent = `
        <h2>Duo License Upgraded!</h2>
        <p><strong>${duoOrg.organization_name}</strong> has been upgraded successfully.</p>
        
        <h3>Upgrade Summary:</h3>
        <ul>
            <li><strong>Organization:</strong> ${duoOrg.organization_name}</li>
            <li><strong>Previous Limit:</strong> ${oldLimit} users</li>
            <li><strong>New Limit:</strong> ${new_user_limit} users</li>
            <li><strong>Additional Users:</strong> ${new_user_limit - oldLimit}</li>
        </ul>
        
        <p>You can now protect more team members. Log in to your dashboard to assign new users.</p>
        `;

        for (const email of adminEmails) {
            try {
                await sendSupportEmail({
                    to: email,
                    subject: `Duo License Upgraded: ${duoOrg.organization_name}`,
                    html: emailContent
                });
            } catch (err) {
                console.error(`Error sending upgrade email to ${email}:`, err.message);
            }
        }

        connection.release();

        res.status(200).json({
            success: true,
            message: 'License upgraded successfully',
            old_limit: oldLimit,
            new_limit: new_user_limit,
            additional_users: new_user_limit - oldLimit
        });

    } catch (error) {
        if (connection) connection.release();
        console.error('[Duo API Error]', error.message);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to upgrade license'
        });
    }
}));


/**
 * GET /api/v1/duo/organizations/:userId
 * Get all Duo organizations for a logged-in user
 * 
 * Response:
 * {
 *   success: true,
 *   organizations: [
 *     {
 *       id: 123,
 *       organization_name: "My Company",
 *       user_limit: 5,
 *       admin_emails: ["admin@example.com"],
 *       status: "active",
 *       created_at: "2026-04-14T10:30:00Z"
 *     }
 *   ]
 * }
 */
router.get('/organizations/:userId', catchAsync(async (req, res) => {
    const userId = req.params.userId;

    if (!userId) {
        return res.status(400).json({
            success: false,
            error: 'Missing userId parameter'
        });
    }

    let connection;
    try {
        connection = await db.getConnection();

        const [organizations] = await connection.query(
            `SELECT id, organization_name, duo_account_id, user_limit, admin_emails, api_hostname, status, created_at
             FROM duo_organizations 
             WHERE customer_id = ? AND status = 'active'
             ORDER BY created_at DESC`,
            [userId]
        );

        // Parse admin_emails JSON
        const parsed = organizations.map(org => ({
            ...org,
            admin_emails: JSON.parse(org.admin_emails || '[]')
        }));

        connection.release();

        res.status(200).json({
            success: true,
            count: parsed.length,
            organizations: parsed
        });

    } catch (error) {
        if (connection) connection.release();
        console.error('[Duo API Error]', error.message);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch organizations'
        });
    }
}));


/**
 * GET /api/v1/duo/organization/:id
 * Get details of a specific Duo organization
 */
router.get('/organization/:id', catchAsync(async (req, res) => {
    const orgId = req.params.id;

    let connection;
    try {
        connection = await db.getConnection();

        const [orgs] = await connection.query(
            'SELECT * FROM duo_organizations WHERE id = ? AND status = "active"',
            [orgId]
        );

        if (orgs.length === 0) {
            connection.release();
            return res.status(404).json({
                success: false,
                error: 'Organization not found'
            });
        }

        const org = orgs[0];
        org.admin_emails = JSON.parse(org.admin_emails || '[]');

        connection.release();

        res.status(200).json({
            success: true,
            organization: org
        });

    } catch (error) {
        if (connection) connection.release();
        console.error('[Duo API Error]', error.message);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch organization'
        });
    }
}));


/**
 * POST /api/v1/duo/test-api
 * Test endpoint - Create new Duo accounts from cart items, then list all accounts
 * 
 * Request body (optional):
 * {
 *   items: [{
 *     organization_name: "MyOrg",
 *     user_limit: 5,
 *     admin_emails: ["admin@example.com"],
 *     edition: "PLATFORM"
 *   }, ...]
 * }
 * 
 * Response:
 * {
 *   success: true,
 *   created_accounts: [...],
 *   all_accounts: [...],
 *   message: "..."
 * }
 */
router.post('/test-api', catchAsync(async (req, res) => {
    try {
        const { items } = req.body || {};
        const createdAccounts = [];
        
        console.log('[Duo Test API] Creating accounts from cart items...');
        
        // Step 1: Create new accounts if items provided
        if (items && Array.isArray(items) && items.length > 0) {
            console.log(`[Duo Test API] Creating ${items.length} account(s)...`);
            
            for (const item of items) {
                try {
                    const { organization_name, user_limit, admin_emails, edition } = item;
                    
                    if (!organization_name || !user_limit) {
                        console.warn('[Duo Test API] Skipping item - missing required fields:', item);
                        continue;
                    }
                    
                    console.log(`[Duo Test API] Creating account: ${organization_name}`);
                    
                    // Create the Duo account
                    const duoAccount = await duoApi.createDuoAccount(organization_name);
                    const accountId = duoAccount.account_id;
                    const apiHostname = duoAccount.api_hostname;
                    
                    // Set user limit
                    try {
                        await duoApi.updateHardUserLimit(accountId, apiHostname, user_limit);
                        console.log(`[Duo Test API] User limit set to ${user_limit}`);
                    } catch (err) {
                        console.warn(`[Duo Test API] Could not set user limit: ${err.message}`);
                    }
                    
                    // Set edition if provided
                    if (edition) {
                        try {
                            await duoApi.setEdition(accountId, apiHostname, edition);
                            console.log(`[Duo Test API] Edition set to ${edition}`);
                        } catch (err) {
                            console.warn(`[Duo Test API] Could not set edition: ${err.message}`);
                        }
                    }
                    
                    // Create admin accounts
                    if (admin_emails && Array.isArray(admin_emails)) {
                        for (const email of admin_emails) {
                            try {
                                await duoApi.createDuoAdministrator(accountId, apiHostname, email);
                                console.log(`[Duo Test API] Admin created: ${email}`);
                            } catch (err) {
                                console.warn(`[Duo Test API] Could not create admin ${email}: ${err.message}`);
                            }
                        }
                    }
                    
                    createdAccounts.push({
                        organization_name,
                        account_id: accountId,
                        api_hostname: apiHostname,
                        user_limit,
                        edition: edition || 'PLATFORM'
                    });
                    
                    console.log(`[Duo Test API] ✅ Account created successfully: ${organization_name} (${accountId})`);
                    
                } catch (itemErr) {
                    console.error(`[Duo Test API] Failed to create account from item:`, itemErr.message);
                    // Continue with next item
                }
            }
        }
        
        // Step 2: List all accounts
        console.log('[Duo Test API] Retrieving all Duo accounts...');
        const allAccounts = await duoApi.listAllAccounts();
        
        console.log('[Duo Test API] Successfully retrieved all accounts');
        
        res.status(200).json({
            success: true,
            timestamp: new Date().toISOString(),
            created_count: createdAccounts.length,
            created_accounts: createdAccounts,
            all_accounts: allAccounts,
            total_accounts: allAccounts.length,
            message: `Created ${createdAccounts.length} new account(s). Found ${allAccounts.length} total account(s) in Duo.`
        });
        
    } catch (error) {
        console.error('[Duo Test API Error]', error.message);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to test Duo API',
            timestamp: new Date().toISOString()
        });
    }
}));

module.exports = router;
