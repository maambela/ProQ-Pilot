/**
 * ===== DUO SECURITY - BACKEND INTEGRATION GUIDE =====
 * 
 * This document outlines the backend API integration required for Duo Security
 * Account creation, management, and customer experience.
 * 
 * IMPORTANT: 
 * - Requires Cisco Duo Admin API credentials
 * - Requires Cisco Duo Accounts API credentials
 * - All API calls must be made server-side (NOT from frontend)
 * - PII and credentials must never be exposed to frontend
 */

// ===== 1. SETUP REQUIREMENTS =====

/**
 * You need:
 * 1. Duo Admin API credentials (for your master account)
 *    - Admin API hostname
 *    - Admin API integration key
 *    - Admin API secret key
 * 
 * 2. Duo Accounts API credentials (for creating child accounts)
 *    - Accounts API hostname
 *    - Accounts API integration key
 *    - Accounts API secret key
 * 
 * 3. SMTP credentials for email notifications
 * 
 * Store these in environment variables:
 * DUO_ADMIN_API_HOSTNAME
 * DUO_ADMIN_API_KEY
 * DUO_ADMIN_API_SECRET
 * DUO_ACCOUNTS_API_HOSTNAME
 * DUO_ACCOUNTS_API_KEY
 * DUO_ACCOUNTS_API_SECRET
 * SMTP_HOST, SMTP_USER, SMTP_PASS
 */

// ===== 2. DATABASE SCHEMA =====

/**
 * Add these tables to track Duo organizations
 */

// CREATE TABLE duo_organizations (
//     id INT PRIMARY KEY AUTO_INCREMENT,
//     customer_id INT NOT NULL,
//     organization_name VARCHAR(255) NOT NULL,
//     duo_account_id VARCHAR(255) UNIQUE NOT NULL,
//     user_limit INT NOT NULL DEFAULT 5,
//     admin_emails JSON NOT NULL,
//     dashboard_url VARCHAR(512),
//     integration_key VARCHAR(255),
//     secret_key VARCHAR(255),
//     api_hostname VARCHAR(255),
//     status ENUM('active', 'suspended', 'deleted') DEFAULT 'active',
//     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
//     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
//     INDEX(customer_id),
//     INDEX(duo_account_id),
//     FOREIGN KEY(customer_id) REFERENCES users(id)
// );

// ===== 3. API ENDPOINTS =====

/**
 * ============================================================
 * ENDPOINT 1: POST /api/v1/duo/create-account
 * ============================================================
 * 
 * Creates a new Duo child account for a customer
 * 
 * REQUEST:
 * {
 *     organization_name: "My Company",
 *     user_limit: 5,
 *     admin_emails: ["admin1@example.com", "admin2@example.com"],
 *     payment_reference: "txn_12345",
 *     customer_email: "customer@example.com"
 * }
 * 
 * RESPONSE:
 * {
 *     success: true,
 *     account_id: "child-account-12345",
 *     organization_name: "My Company",
 *     dashboard_url: "https://admin-12345.duosecurity.com",
 *     integration_key: "key_...",
 *     api_hostname: "api-12345.duosecurity.com",
 *     message: "Account created successfully"
 * }
 * 
 * STEPS:
 * 1. Verify user is authenticated and has valid payment
 * 2. Call Duo Accounts API to create new account
 * 3. Set hard user limit via Duo Admin API
 * 4. Create administrator accounts for each admin email
 * 5. Store account details in database
 * 6. Send confirmation email to all admins
 * 7. Return account details to frontend
 */

// Backend implementation example (Node.js/Express):
// POST /api/v1/duo/create-account

const createDuoAccount = async (req, res) => {
    try {
        const { organization_name, user_limit, admin_emails, payment_reference, customer_email } = req.body;
        const userId = req.user.id; // From auth middleware

        // 1. Verify payment was successful
        const order = await Order.findOne({ 
            reference: payment_reference, 
            status: 'completed' 
        });
        if (!order) {
            return res.status(400).json({ error: 'Invalid or incompleted payment' });
        }

        // 2. Call Duo Accounts API to create account
        const accountResponse = await callDuoAPI(
            'POST',
            process.env.DUO_ACCOUNTS_API_HOSTNAME,
            process.env.DUO_ACCOUNTS_API_KEY,
            process.env.DUO_ACCOUNTS_API_SECRET,
            '/accounts/v1/account/create',
            {
                account_name: organization_name,
                email: customer_email
            }
        );

        const accountId = accountResponse.account_id;
        const apiHostname = accountResponse.api_hostname;
        const integrationKey = accountResponse.integration_key;
        const secretKey = accountResponse.secret_key;

        // 3. Set hard user limit (requires Admin API call to child account)
        // Note: This requires temporarily switching to child account credentials
        await setDuoUserLimit(
            apiHostname,
            integrationKey,
            secretKey,
            user_limit
        );

        // 4. Create administrator accounts
        const adminCreationPromises = admin_emails.map(email => 
            createDuoAdministrator(
                apiHostname,
                integrationKey,
                secretKey,
                email
            )
        );
        await Promise.all(adminCreationPromises);

        // 5. Store in database
        const duoOrg = await DuoOrganization.create({
            customer_id: userId,
            organization_name,
            duo_account_id: accountId,
            user_limit,
            admin_emails,
            dashboard_url: `https://admin-${accountId}.duosecurity.com`,
            integration_key: integrationKey,
            secret_key: secretKey,
            api_hostname: apiHostname,
            status: 'active'
        });

        // 6. Send confirmation emails
        await sendDuoConfirmationEmails(
            admin_emails,
            organization_name,
            user_limit,
            accountId
        );

        // 7. Return response
        res.json({
            success: true,
            account_id: accountId,
            organization_name,
            dashboard_url: `https://admin-${accountId}.duosecurity.com`,
            message: 'Duo account created successfully. Check your email for setup instructions.'
        });

    } catch (error) {
        console.error('[Duo API] Account creation error:', error);
        res.status(500).json({ error: 'Failed to create Duo account' });
    }
};


/**
 * ============================================================
 * ENDPOINT 2: POST /api/v1/duo/upgrade-license
 * ============================================================
 * 
 * Upgrade an existing Duo organization with more users
 * 
 * REQUEST:
 * {
 *     duo_org_id: 123,
 *     new_user_limit: 10,
 *     payment_reference: "txn_67890"
 * }
 * 
 * RESPONSE:
 * {
 *     success: true,
 *     old_limit: 5,
 *     new_limit: 10,
 *     price_difference: 2500,
 *     message: "License upgraded successfully"
 * }
 * 
 * STEPS:
 * 1. Find Duo organization in database
 * 2. Verify payment was successful
 * 3. Update hard user limit via Duo Admin API
 * 4. Update database record
 * 5. Send confirmation email
 */

const upgradeDuoLicense = async (req, res) => {
    try {
        const { duo_org_id, new_user_limit, payment_reference } = req.body;
        const userId = req.user.id;

        // 1. Find organization
        const duoOrg = await DuoOrganization.findOne({
            id: duo_org_id,
            customer_id: userId
        });
        if (!duoOrg) {
            return res.status(404).json({ error: 'Duo organization not found' });
        }

        // 2. Verify payment
        const order = await Order.findOne({
            reference: payment_reference,
            status: 'completed'
        });
        if (!order) {
            return res.status(400).json({ error: 'Payment not verified' });
        }

        const oldLimit = duoOrg.user_limit;

        // 3. Update Duo hard user limit
        await setDuoUserLimit(
            duoOrg.api_hostname,
            duoOrg.integration_key,
            duoOrg.secret_key,
            new_user_limit
        );

        // 4. Update database
        duoOrg.user_limit = new_user_limit;
        await duoOrg.save();

        // 5. Send confirmation
        await sendDuoUpgradeEmail(
            duoOrg.admin_emails,
            duoOrg.organization_name,
            oldLimit,
            new_user_limit
        );

        res.json({
            success: true,
            old_limit: oldLimit,
            new_limit: new_user_limit,
            message: 'License upgraded successfully'
        });

    } catch (error) {
        console.error('[Duo API] Upgrade error:', error);
        res.status(500).json({ error: 'Failed to upgrade license' });
    }
};


/**
 * ============================================================
 * ENDPOINT 3: GET /api/v1/duo/organizations
 * ============================================================
 * 
 * Get all Duo organizations for logged-in user
 * 
 * RESPONSE:
 * {
 *     organizations: [
 *         {
 *             id: 123,
 *             organization_name: "My Company",
 *             user_limit: 5,
 *             admin_emails: ["admin@example.com"],
 *             status: "active",
 *             created_at: "2026-04-14T10:30:00Z"
 *         }
 *     ]
 * }
 */

const getDuoOrganizations = async (req, res) => {
    try {
        const userId = req.user.id;
        
        const organizations = await DuoOrganization.find({
            customer_id: userId,
            status: 'active'
        });

        res.json({ organizations });
    } catch (error) {
        console.error('[Duo API] Fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch organizations' });
    }
};


/**
 * ============================================================
 * ENDPOINT 4: POST /api/v1/duo/send-confirmation
 * ============================================================
 * 
 * Sends confirmation email to administrators
 * Called from frontend after successful payment
 */

const sendDuoConfirmationEmails = async (adminEmails, orgName, userLimit, accountId) => {
    const emailContent = `
        <h2>Welcome to Cisco Duo Security!</h2>
        <p>Your organization has been successfully created.</p>
        
        <h3>Organization Details:</h3>
        <ul>
            <li><strong>Organization:</strong> ${orgName}</li>
            <li><strong>Licensed Users:</strong> ${userLimit}</li>
            <li><strong>Account ID:</strong> ${accountId}</li>
        </ul>
        
        <h3>Next Steps:</h3>
        <ol>
            <li>Log in to admin dashboard: https://admin-${accountId}.duosecurity.com</li>
            <li>Configure your security policies</li>
            <li>Add your team members</li>
            <li>Enable multi-factor authentication</li>
            <li>Test with a pilot group</li>
        </ol>
        
        <p><strong>Support:</strong> Contact our team 24/7 for any assistance.</p>
    `;

    for (const email of adminEmails) {
        await sendEmail({
            to: email,
            subject: `Duo Security Account Created: ${orgName}`,
            html: emailContent
        });
    }
};


/**
 * ============================================================
 * HELPER FUNCTIONS
 * ============================================================
 */

/**
 * Call Duo API with proper authentication
 */
const callDuoAPI = async (method, hostname, integrationKey, secretKey, endpoint, params) => {
    // Implement Duo API HMAC authentication
    // See: https://duo.com/docs/duosec
    
    const crypto = require('crypto');
    const canonicalRequest = buildCanonicalRequest(method, endpoint, params);
    const signature = crypto
        .createHmac('sha1', secretKey)
        .update(canonicalRequest)
        .digest('hex');
    
    const auth = Buffer.from(`${integrationKey}:${signature}`).toString('base64');
    
    const response = await fetch(`https://${hostname}${endpoint}`, {
        method,
        headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams(params).toString()
    });

    if (!response.ok) {
        throw new Error(`Duo API error: ${response.statusText}`);
    }

    return await response.json();
};

/**
 * Set Duo hard user limit
 */
const setDuoUserLimit = async (hostname, integrationKey, secretKey, limit) => {
    // This requires calling the child account's API
    const response = await callDuoAPI(
        'POST',
        hostname,
        integrationKey,
        secretKey,
        '/admin/v1/settings/update_user_limit',
        {
            user_limit: limit,
            enforcement: 'soft' // or 'hard' depending on policy
        }
    );
    return response;
};

/**
 * Create Duo administrator account
 */
const createDuoAdministrator = async (hostname, integrationKey, secretKey, email) => {
    const response = await callDuoAPI(
        'POST',
        hostname,
        integrationKey,
        secretKey,
        '/admin/v1/administrators',
        {
            username: email,
            email: email,
            role: 'Admin'
        }
    );
    return response;
};

/**
 * Send email utility
 */
const sendEmail = async ({ to, subject, html }) => {
    // Use nodemailer or similar
    const transporter = require('nodemailer').createTransport({
        host: process.env.SMTP_HOST,
        port: 587,
        secure: false,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });

    await transporter.sendMail({
        from: process.env.FROM_EMAIL,
        to,
        subject,
        html
    });
};

/**
 * Build canonical request for Duo HMAC auth
 */
const buildCanonicalRequest = (method, endpoint, params) => {
    const lines = [method.toUpperCase(), endpoint];
    
    // Sort params and build query string
    const sorted = Object.keys(params)
        .sort()
        .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
        .join('&');
    
    lines.push(sorted);
    return lines.join('\n');
};


// ===== 4. INTEGRATION WITH CHECKOUT =====

/**
 * In your checkout/payment success handler:
 * 
 * After successful payment:
 * 1. Mark order as completed
 * 2. Check if order contains Duo product
 * 3. If yes, call /api/v1/duo/create-account
 * 4. Store Duo account reference in order record
 */

const handlePaymentSuccess = async (paymentRef) => {
    const order = await Order.findOne({ reference: paymentRef });
    
    if (order.items.some(item => item.type === 'duo-security')) {
        const duoConfig = order.duo_config;
        
        // Trigger Duo account creation
        const duoResult = await fetch('/api/v1/duo/create-account', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                organization_name: duoConfig.organization_name,
                user_limit: duoConfig.user_limit,
                admin_emails: duoConfig.admin_emails,
                payment_reference: paymentRef,
                customer_email: order.customer_email
            })
        });

        if (duoResult.ok) {
            order.duo_account_id = duoResult.account_id;
            await order.save();
        }
    }
};


// ===== 5. USER DASHBOARD (MY DUO ORGANIZATIONS) =====

/**
 * Extend user account page to show:
 * - List of Duo organizations
 * - Upgrade button for each
 * - Manage / View Dashboard links
 * 
 * The frontend HTML structure:
 * 
 * <section class="my-duo-organizations">
 *     <h2>My Duo Security Organizations</h2>
 *     <div class="duo-org-list">
 *         <!-- Populated by JavaScript from /api/v1/duo/organizations -->
 *     </div>
 * </section>
 */


module.exports = {
    createDuoAccount,
    upgradeDuoLicense,
    getDuoOrganizations
};
