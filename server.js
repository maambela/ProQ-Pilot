require('dotenv').config();

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const crypto = require('crypto');
const AppError = require('./utils/appError');
const {
    EMAIL_SENDERS,
    ORDER_NOTIFICATION_RECIPIENTS,
    sendMailOptions,
    sendSupportEmail,
    verifyGraphEmailConfig
} = require('./utils/email');
const duoApi = require('./utils/duoApi'); // Path to your duoApi.js file

const db = require('./utils/db');
const userRouter = require('./routers/userRouter');
const duoRouter = require('./routers/duoRouter');
const microsoftLicenseRouter = require('./routers/microsoftLicenseRouter');
const catchAsync = require('./utils/catchAsync');

const app = express();
app.use(cors());
app.use(express.json({
    verify: (req, res, buf) => {
        req.rawBody = buf.toString('utf8');
    }
}));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
    const blockedStaticPath = /^\/(?:\.env(?:\..*)?|routers\/|controllers\/|models\/|utils\/|node_modules\/|server(?:\.js|-.*\.log|.*\.log)?|package(?:-lock)?\.json)/i;
    if (blockedStaticPath.test(req.path)) {
        return res.status(404).send('Not found');
    }
    next();
});

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_YEAR_MS = 365 * ONE_DAY_MS;

function getPublicBaseUrl(req) {
    const configuredUrl = process.env.PUBLIC_BASE_URL || process.env.APP_BASE_URL || process.env.BASE_URL;
    if (configuredUrl) return configuredUrl.replace(/\/+$/, '');

    const protocol = req.get('x-forwarded-proto') || req.protocol || 'https';
    const host = req.get('x-forwarded-host') || req.get('host');
    return `${protocol}://${host}`;
}

function isYocoWebhookSignatureValid(req) {
    const secret = process.env.YOCO_WEBHOOK_SECRET;
    if (!secret) {
        console.warn('[YOCO WEBHOOK] YOCO_WEBHOOK_SECRET is not configured; skipping signature verification.');
        return true;
    }

    const webhookId = req.get('webhook-id');
    const timestamp = req.get('webhook-timestamp');
    const signatureHeader = req.get('webhook-signature');
    const rawBody = req.rawBody;

    if (!webhookId || !timestamp || !signatureHeader || !rawBody) return false;

    const timestampMs = Number(timestamp) * 1000;
    if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 3 * 60 * 1000) {
        return false;
    }

    const secretValue = secret.startsWith('whsec_') ? secret.split('_')[1] : secret;
    const expectedSignature = crypto
        .createHmac('sha256', Buffer.from(secretValue, 'base64'))
        .update(`${webhookId}.${timestamp}.${rawBody}`)
        .digest('base64');

    return signatureHeader
        .split(' ')
        .map(part => part.split(',')[1])
        .filter(Boolean)
        .some(signature => {
            const expected = Buffer.from(expectedSignature);
            const actual = Buffer.from(signature);
            return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
        });
}

function setLongLivedAssetCache(res) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
}

function setStaticAssetCache(res, filePath) {
    if (/\.(?:avif|webp|png|jpe?g|gif|svg|ico|css|js|woff2?)$/i.test(filePath)) {
        setLongLivedAssetCache(res);
    }
}

// Serve uploaded product images first so they get long-lived browser/CDN caching.
app.use('/product_images', express.static('product_images', {
    maxAge: ONE_YEAR_MS,
    immutable: true,
    setHeaders: setLongLivedAssetCache
}));

// Serve static files from the root directory (to access HTML files and bundled assets).
app.use(express.static('./', {
    maxAge: 0,
    setHeaders: setStaticAssetCache
}));

app.get('/favicon.ico', (req, res) => {
    res.redirect(302, '/Images/Logos/Proq2.png');
});

app.get('/robots.txt', (req, res) => {
    res.type('text/plain').send([
        'User-agent: *',
        'Allow: /',
        'Disallow: /admin_',
        'Disallow: /api/'
    ].join('\n'));
});

app.get('/brands.html', (req, res) => res.redirect(302, '/store.html'));
app.get('/about.html', (req, res) => res.redirect(302, '/contact.html'));


const axios = require('axios'); // Add this for API calls

app.get('/image-proxy', async (req, res) => {
    try {
        const imageUrl = String(req.query.url || '');
        if (!/^https?:\/\//i.test(imageUrl)) {
            return res.status(400).send('Invalid image URL');
        }

        const upstream = await axios.get(imageUrl, {
            responseType: 'stream',
            timeout: 12000,
            headers: { 'User-Agent': 'ProQ-Pilot-Image-Proxy/1.0' }
        });

        res.setHeader('Content-Type', upstream.headers['content-type'] || 'image/jpeg');
        if (upstream.headers['content-length']) {
            res.setHeader('Content-Length', upstream.headers['content-length']);
        }
        res.setHeader('Cache-Control', 'public, max-age=604800, s-maxage=604800, stale-while-revalidate=86400');
        upstream.data.pipe(res);
    } catch (error) {
        res.status(502).send('Unable to load image');
    }
});

// ==========================================================================================================//
//                                                User ROUTES                                                //
// ==========================================================================================================//

// creatomh new user 
app.use('/api/v1/users', userRouter);

// Duo License Routes
app.use('/api/v1/duo', duoRouter);

// Microsoft License Routes
app.use('/api/v1/microsoft', microsoftLicenseRouter);

// login in users 
//??????????????????????????????????

// --- MULTER SETUP FOR FILE UPLOADS ---
const multerStorage = multer.diskStorage({ //telling multer where to store the uploaded files and how to name them
    destination: (req, file, cb) =>{
        // call back function uses error and destination as parameters
        cb(null, 'product_images'); // setting the destination folder for uploaded files
    },
    filename: (req, file, cb) =>{
        const ext = file.mimetype.split('/')[1]; // extracting the file extension from the mimetype
        cb(null, `product-${Date.now()}.${ext}`); // setting the filename as 'product-currenttimestamp.extension'
    }
});

function safeJsonParse(value, fallback = {}) {
  try {
    if (value === null || value === undefined) return fallback;

    // Already an object
    if (typeof value === 'object') return value;

    // String JSON
    if (typeof value === 'string') {
      if (!value.trim()) return fallback;
      // CRITICAL FIX: Catch the bad string before parsing
      if (value.includes('[object Object]')) return fallback; 
      
      return JSON.parse(value);
    }

    return fallback;
  } catch (err) {
    console.error('Error parsing JSON:', err.message);
    return fallback;
  }
}

let supplierTrackingSchemaPromise = null;

async function ensureSupplierTrackingSchema(connection) {
    if (!supplierTrackingSchemaPromise) {
        supplierTrackingSchemaPromise = (async () => {
            const [sourceColumns] = await connection.query(
                "SHOW COLUMNS FROM products LIKE 'supplier_source'"
            );

            if (sourceColumns.length === 0) {
                try {
                    await connection.query(
                        "ALTER TABLE products ADD COLUMN supplier_source VARCHAR(50) NULL AFTER processor"
                    );
                } catch (error) {
                    if (error.code !== 'ER_DUP_FIELDNAME') throw error;
                }
            }

            const [sourceIndexes] = await connection.query(
                "SHOW INDEX FROM products WHERE Key_name = 'idx_products_supplier_source'"
            );

            if (sourceIndexes.length === 0) {
                try {
                    await connection.query(
                        "ALTER TABLE products ADD INDEX idx_products_supplier_source (supplier_source)"
                    );
                } catch (error) {
                    if (error.code !== 'ER_DUP_KEYNAME') throw error;
                }
            }

            await connection.query(`
                CREATE TABLE IF NOT EXISTS supplier_sync_status (
                    supplier VARCHAR(50) PRIMARY KEY,
                    last_success_at DATETIME NULL,
                    fetched_count INT NOT NULL DEFAULT 0,
                    in_stock_count INT NOT NULL DEFAULT 0,
                    added_count INT NOT NULL DEFAULT 0,
                    updated_count INT NOT NULL DEFAULT 0,
                    skipped_count INT NOT NULL DEFAULT 0,
                    last_error TEXT NULL,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB
            `);
        })().catch(error => {
            supplierTrackingSchemaPromise = null;
            throw error;
        });
    }

    return supplierTrackingSchemaPromise;
}

function isDigitalLicenseType(type) {
  return type === 'duo-security' ||
    type === 'duo-security-upgrade' ||
    type === 'microsoft-license';
}

function getDigitalLicenseConfig(item) {
  return item.duo_config ||
    item.duo_config_json ||
    item.microsoft_config ||
    item.microsoft_config_json ||
    {};
}

// filter function to only allow image uploads 
const multerFilter = (req, file, cb) => {
    if(file.mimetype.startsWith('image')){
        cb(null, true); // tells multer to accept the file since it is an image
    } else {
        cb(new AppError('Not an image! Please upload only images.', 400), false); // tells multer to reject the file since it is not an image
    }
};

// configuring multer with the defined storage and filter
const upload = multer({
    storage: multerStorage,
    fileFilter: multerFilter,
    limits: {
        fileSize: Number(process.env.PRODUCT_IMAGE_MAX_BYTES || 3 * 1024 * 1024)
    }
}); 

// setting up multer to store uploaded files in 'product_images' directory
exports.uploadproductPhoto = upload.array('photo'); 

// ============================================================================//
//                  creating the function to call AXIS API                     //
//=============================================================================//

// 🔑 AUTHENTICATION: Get temporary access token
async function getAxizToken() {
    const params = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.AXIZ_CLIENT_ID,
        client_secret: process.env.AXIZ_CLIENT_SECRET,
        scope: process.env.AXIZ_SCOPE
    });

    const response = await axios.post(process.env.AXIZ_TOKEN_URL, params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    return response.data.access_token;
}

// --- REGEX CLEANING TOOLS ---
function cleanName(name) {
    // Removes things like "16GB RAM", "i7-1234", "512GB SSD", etc.
    return name.split('|')[0]
               .replace(/\d+GB|\d+TB|SSD|HDD|i\d|Ryzen \d/gi, '')
               .replace(/  +/g, ' ')
               .trim();
}

// PROFIT CALCULATION (Updated to match your other routes)
async function getRetailPrice(warehousePrice, brand) {
    const connection = await db.getConnection(); // Get connection like your other routes
    try {
        const brandUpper = brand ? brand.toUpperCase() : 'UNKNOWN';
        const [rows] = await connection.query('SELECT margin_percentage FROM BrandMargins WHERE brand_name = ?', [brandUpper]);
        
        const margin = rows.length > 0 ? parseFloat(rows[0].margin_percentage) : 20.00;
        return (warehousePrice * (1 + margin / 100)).toFixed(2);
    } finally {
        connection.release(); // Always release!
    }
}

// 🇿🇦 PAYFAST SIGNATURE GENERATION
function generatePayFastSignature(data, passphrase = null) {
    let pfOutput = '';
    // PayFast requires fields to be in a specific order, or at least consistent
    // The current PHP code just iterates over them.
    for (let key in data) {
        if (data.hasOwnProperty(key) && key !== 'signature' && data[key] !== '' && data[key] !== null) {
            pfOutput += `${key}=${encodeURIComponent(data[key].toString().trim()).replace(/%20/g, '+')}&`;
        }
    }

    let getString = pfOutput.slice(0, -1);
    if (passphrase) {
        getString += `&passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, '+')}`;
    }

    return crypto.createHash('md5').update(getString).digest('hex');
}

// ============== PAYFAST CHECKOUT ENDPOINT ==============
app.post('/api/v1/payfast-checkout', async (req, res, next) => {
    const { userID, addressID, items } = req.body;
    
    try {
        // Step 1: Create order with items (similar to Yoco flow)
        const orderId = await executeWithRetry(async () => {
            let connection;
            try {
                connection = await db.getConnection();
                await connection.beginTransaction();

                // Calculate totals
                const subtotal = items.reduce((s, i) => s + (i.price * i.quantity), 0);
                const hasPhysicalProducts = items.some(i => !isDigitalLicenseType(i.type || i.cart_type));
                const delivery = hasPhysicalProducts ? 75 : 0;
                const totalAmount = subtotal + delivery;

                // FIX: Handle digital-only orders where addressID is 0. Set to NULL.
                const dbAddressId = (addressID === 0 || addressID === '0' || !hasPhysicalProducts) ? null : addressID;

                // Create order with PENDING status
                const [orderRes] = await connection.query(
                    'INSERT INTO Orders (userID, addressID, total_amount, status) VALUES (?, ?, ?, ?)',
                    [userID, dbAddressId, totalAmount, 'pending']
                );
                const orderId = orderRes.insertId;

                // Insert order items
                for (const item of items) {
                    const itemType = item.type || item.cart_type;

                    // Skip OrderItems insert for digital license items (they don't have real product IDs)
                    if (!isDigitalLicenseType(itemType)) {
                        await connection.query(
                            'INSERT INTO OrderItems (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)',
                            [orderId, item.id, item.quantity, item.price]
                        );
                    }

                    // Persist digital license purchase configuration (so order pages can render without product rows)
                    if (isDigitalLicenseType(itemType)) {
                        await connection.query(
                            `INSERT INTO duo_order_items_meta (order_id, cart_product_id, cart_type, duo_config_json)
                             VALUES (?, ?, ?, ?)
                             ON DUPLICATE KEY UPDATE
                                cart_type = VALUES(cart_type),
                                duo_config_json = VALUES(duo_config_json)`,
                            [
                                orderId,
                                String(item.id),
                                itemType,
                                JSON.stringify(getDigitalLicenseConfig(item))
                            ]
                        );
                    }
                }

                // Create payment record
                await connection.query(
                    'INSERT INTO Payments (order_id, userID, amount, provider, status) VALUES (?, ?, ?, ?, ?)',
                    [orderId, userID, totalAmount, 'PAYFAST', 'pending']
                );

                await connection.commit();
                connection.release();
                return orderId;
            } catch (err) {
                if (connection) {
                    await connection.rollback();
                    connection.release();
                }
                throw err;
            }
        });

        // Step 2: Get order and user details for PayFast
        let connection = await db.getConnection();
        const [orders] = await connection.query('SELECT total_amount FROM Orders WHERE id = ?', [orderId]);
        const [users] = await connection.query('SELECT firstName, lastName, email FROM users WHERE userID = ?', [userID]);
        connection.release();

        const totalAmount = orders[0].total_amount;
        const user = users[0];

        // Step 3: Prepare PayFast Data
        const payfastData = {
            merchant_id: process.env.PAYFAST_MERCHANT_ID,
            merchant_key: process.env.PAYFAST_MERCHANT_KEY,
            return_url: `${process.env.PAYFAST_RETURN_URL}?orderId=${orderId}`,
            cancel_url: process.env.PAYFAST_CANCEL_URL,
            notify_url: process.env.PAYFAST_NOTIFY_URL,
            name_first: user.firstName,
            name_last: user.lastName,
            email_address: user.email,
            m_payment_id: orderId.toString(), // Use order ID as merchant payment ID
            amount: parseFloat(totalAmount).toFixed(2),
            item_name: `ProQ Pilot Order #${orderId}`,
        };

        // Generate signature
        const signature = generatePayFastSignature(payfastData, process.env.PAYFAST_PASSPHRASE);
        payfastData.signature = signature;

        // Step 4: Build PayFast URL
        const baseUrl = process.env.PAYFAST_MODE === 'live' 
            ? process.env.PAYFAST_LIVE_URL 
            : process.env.PAYFAST_SANDBOX_URL;
        
        let pfOutput = '';
        for (let key in payfastData) {
            if (payfastData[key] !== '' && payfastData[key] !== null) {
                pfOutput += `${key}=${encodeURIComponent(String(payfastData[key]).trim()).replace(/%20/g, '+')}&`;
            }
        }
        
        const paymentUrl = `${baseUrl}?${pfOutput.slice(0, -1)}`;

        // Update payment record with signature (optional, but good for tracking)
        connection = await db.getConnection();
        await connection.query(
            'UPDATE Payments SET provider_response = ? WHERE order_id = ?',
            [JSON.stringify({ payfast_signature: signature }), orderId]
        );
        connection.release();

        res.status(200).json({
            status: 'success',
            data: {
                orderId,
                paymentUrl,
                amount: totalAmount
            }
        });

    } catch (err) {
        console.error('PayFast checkout error:', err);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// ============== HELPER: Create Duo Account After Payment ==============
async function createDuoAccountAfterPayment(orderId, userID, connection) {
    try {
        console.log(`\n[DUO PROVISIONING] ========================================`);
        console.log(`[DUO PROVISIONING] 🚀 STARTING: Order #${orderId}, User #${userID}`);
        console.log(`[DUO PROVISIONING] ========================================\n`);
        
        // Fetch Duo items from the order
        console.log(`[DUO PROVISIONING] Step 1: Fetching Duo items from database...`);
        const [duoItems] = await connection.query(
            `SELECT * FROM duo_order_items_meta
             WHERE order_id = ? AND cart_type IN ('duo-security', 'duo-security-upgrade')`,
            [orderId]
        );

        console.log(`[DUO PROVISIONING] Found ${duoItems.length} Duo item(s)`);
        
        if (duoItems.length === 0) {
            console.log(`[DUO PROVISIONING] ❌ No Duo items found. Skipping account creation.\n`);
            return null;
        }

        // Extract first Duo item config (typically only one Duo purchase per order)
        const duoItem = duoItems[0];
        console.log(`[DUO PROVISIONING] Step 2: Parsing Duo configuration...`);
        const config = safeJsonParse(duoItem.duo_config_json);

        if (!config || !config.organization_name) {
            console.error(`[DUO PROVISIONING] ❌ Invalid or missing configuration for order #${orderId}`);
            console.log(`[DUO PROVISIONING] Config received:`, config);
            console.log(`[DUO PROVISIONING] ========================================\n`);
            return null;
        }

        console.log(`[DUO PROVISIONING] ✅ Config parsed successfully`);
        console.log(`[DUO PROVISIONING]    Organization: ${config.organization_name}`);
        console.log(`[DUO PROVISIONING]    Edition: ${config.edition || 'PLATFORM'}`);
        console.log(`[DUO PROVISIONING]    User Limit: ${config.user_limit || 5}`);
        console.log(`[DUO PROVISIONING]    Admin Emails: ${Array.isArray(config.admin_emails) ? config.admin_emails.join(', ') : 'None'}`);

        // Extract necessary fields
        const {
            organization_name,
            user_limit = 5,
            edition = 'PLATFORM',
            admin_emails = []
        } = config;

        try {
            // ============ STEP 1: Create the Child Account ============
            console.log(`\n[DUO API] Step 3: CREATING CHILD ACCOUNT`);
            console.log(`[DUO API] Calling: POST /accounts/v1/account/create`);
            console.log(`[DUO API] Parameters: name="${organization_name}"`);
            
            const duoAccount = await duoApi.createDuoAccount(organization_name);
            const { account_id, api_hostname } = duoAccount;
            
            console.log(`[DUO API] ✅ Account created successfully!`);
            console.log(`[DUO API]    Account ID: ${account_id}`);
            console.log(`[DUO API]    API Hostname: ${api_hostname}`);

            // ============ STEP 2: Set the Edition ============
            console.log(`\n[DUO API] Step 4: SETTING EDITION`);
            console.log(`[DUO API] Calling: POST /admin/v1/billing/edition`);
            console.log(`[DUO API] Parameters: account_id="${account_id}", edition="${edition}"`);
            console.log(`[DUO API] Using hostname: ${api_hostname}`);
            
            await duoApi.setEdition(account_id, api_hostname, edition);
            console.log(`[DUO API] ✅ Edition set to ${edition}`);

            // ============ STEP 3: Set the Hard User Limit ============
            console.log(`\n[DUO API] Step 5: SETTING USER LIMIT`);
            console.log(`[DUO API] Calling: PUT /admin/v1/accounts/${account_id}/settings/hard_user_limit`);
            console.log(`[DUO API] Parameters: hard_limit="${user_limit}"`);
            console.log(`[DUO API] Using hostname: ${api_hostname}`);
            
            await duoApi.updateHardUserLimit(account_id, api_hostname, user_limit);
            console.log(`[DUO API] ✅ User limit set to ${user_limit}`);

            // ============ STEP 4: Create Administrators ============
            console.log(`\n[DUO API] Step 6: CREATING ADMINISTRATORS`);
            const adminEmails = Array.isArray(admin_emails) ? admin_emails : [];
            console.log(`[DUO API] Total admins to create: ${adminEmails.length}`);
            
            if (adminEmails && adminEmails.length > 0) {
                for (let i = 0; i < adminEmails.length; i++) {
                    const email = adminEmails[i];
                    try {
                        console.log(`[DUO API]   Admin ${i + 1}/${adminEmails.length}: ${email}`);
                        console.log(`[DUO API]   Calling: POST /admin/v1/admins`);
                        console.log(`[DUO API]   Parameters: email="${email}", role="Owner"`);
                        
                        await duoApi.createDuoAdministrator(account_id, api_hostname, email);
                        console.log(`[DUO API]   ✅ Admin created: ${email}`);
                    } catch (adminErr) {
                        console.warn(`[DUO API]   ⚠️ Admin creation skipped for ${email}: ${adminErr.message}`);
                    }
                }
            } else {
                console.log(`[DUO API]   ℹ️ No admin emails provided`);
            }

            // ============ STEP 5: Update Database ============
            console.log(`\n[DUO PROVISIONING] Step 7: UPDATING DATABASE`);
            console.log(`[DUO PROVISIONING] Updating duo_order_items_meta...`);
            
            await connection.query(
                `UPDATE duo_order_items_meta 
                 SET duo_account_id = ?, status = 'deployed', api_hostname = ? 
                 WHERE order_id = ?`,
                [account_id, api_hostname, orderId]
            );
            console.log(`[DUO PROVISIONING] ✅ duo_order_items_meta updated`);

            console.log(`[DUO PROVISIONING] Creating record in duo_organizations...`);
            
            await connection.query(
                `INSERT INTO duo_organizations 
                 (customer_id, organization_name, duo_account_id, user_limit, admin_emails, api_hostname, status)
                 VALUES (?, ?, ?, ?, ?, ?, 'active')`,
                [userID, organization_name, account_id, user_limit, JSON.stringify(admin_emails), api_hostname]
            );
            console.log(`[DUO PROVISIONING] ✅ duo_organizations record created`);
            
            console.log(`\n[DUO PROVISIONING] ========================================`);
            console.log(`[DUO PROVISIONING] ✅ PROVISIONING COMPLETE FOR ORDER #${orderId}`);
            console.log(`[DUO PROVISIONING] Account ID: ${account_id}`);
            console.log(`[DUO PROVISIONING] Organization: ${organization_name}`);
            console.log(`[DUO PROVISIONING] ========================================\n`);
            
            return {
                account_id,
                api_hostname,
                organization_name,
                user_limit,
                edition,
                admin_emails
            };

        } catch (error) {
            console.error(`\n[DUO API] ❌ PROVISIONING FAILED`);
            console.error(`[DUO API] Error:`, error.message);
            console.error(`[DUO API] Stack:`, error.stack);
            console.log(`[DUO PROVISIONING] ========================================\n`);
            throw error;
        }

    } catch (error) {
        console.error(`\n[DUO PROVISIONING] ❌ FATAL ERROR`);
        console.error(`[DUO PROVISIONING] Order #${orderId} - Error: ${error.message}`);
        console.error(`[DUO PROVISIONING] ========================================\n`);
        // Log but don't throw - payment already completed, manual intervention needed
        return null;
    }
}

// ============== PAYFAST WEBHOOK (ITN) ==============
app.post('/webhook/payfast', async (req, res) => {
    console.log('\n[PAYFAST WEBHOOK] ===============================================');
    console.log('[PAYFAST WEBHOOK] ✉️ ITN RECEIVED FROM PAYFAST');
    console.log('[PAYFAST WEBHOOK] ===============================================');
    
    const pfData = req.body;
    
    // 1. Verify Signature
    const signature = pfData.signature;
    delete pfData.signature;
    const calculatedSignature = generatePayFastSignature(pfData, process.env.PAYFAST_PASSPHRASE);
    
    if (signature !== calculatedSignature) {
        console.error('[PAYFAST WEBHOOK] ❌ Signature mismatch! Rejecting webhook.');
        return res.status(400).send('Invalid signature');
    }

    console.log('[PAYFAST WEBHOOK] ✅ Signature verified');

    const orderId = pfData.m_payment_id;
    const paymentStatus = pfData.payment_status;

    console.log(`[PAYFAST WEBHOOK] Order ID: ${orderId}`);
    console.log(`[PAYFAST WEBHOOK] Payment Status: ${paymentStatus}`);

    if (paymentStatus === 'COMPLETE') {
        let connection;
        try {
            console.log('[PAYFAST WEBHOOK] ✅ Payment is COMPLETE - processing...');
            connection = await db.getConnection();
            console.log('[PAYFAST WEBHOOK] ✅ Database connection acquired');
            
            await connection.beginTransaction();
            console.log('[PAYFAST WEBHOOK] ✅ Transaction started');

            // 1. Update Payment status
            console.log('[PAYFAST WEBHOOK] Step 1: Updating payment status...');
            await connection.query(
                'UPDATE Payments SET status = ?, provider_response = ? WHERE order_id = ?',
                ['completed', JSON.stringify(pfData), orderId]
            );

            // 2. Update Order status
            console.log('[PAYFAST WEBHOOK] Step 2: Updating order status...');
            await connection.query(
                'UPDATE Orders SET status = ? WHERE id = ?',
                ['paid', orderId]
            );

            // 3. Get order info for email and Duo provisioning
            console.log('[PAYFAST WEBHOOK] Step 3: Fetching order details...');
            const [orders] = await connection.query('SELECT * FROM Orders WHERE id = ?', [orderId]);
            const order = orders[0];

            await connection.commit();
            console.log(`[PAYFAST WEBHOOK] ✅ Order #${orderId} marked as PAID`);

            // 4. Check for Duo items
            console.log('[PAYFAST WEBHOOK] Step 4: Checking for Duo items...');
            const [duoItems] = await connection.query(
                `SELECT * FROM duo_order_items_meta
                 WHERE order_id = ? AND cart_type IN ('duo-security', 'duo-security-upgrade')`,
                [orderId]
            );

            if (duoItems.length > 0) {
                console.log(`[PAYFAST WEBHOOK] ✅ Found ${duoItems.length} Duo item(s)`);
                console.log('[PAYFAST WEBHOOK] Step 5: INITIATING DUO ACCOUNT PROVISIONING...\n');
                
                // Create Duo account using shared helper function (AWAIT this!)
                try {
                    const duoAccount = await createDuoAccountAfterPayment(orderId, order.userID, connection);
                    if (duoAccount) {
                        console.log(`\n[PAYFAST WEBHOOK] ✅ DUO ACCOUNT PROVISIONING SUCCESSFUL`);
                        console.log(`[PAYFAST WEBHOOK] Account ID: ${duoAccount.account_id}`);
                        console.log(`[PAYFAST WEBHOOK] Organization: ${duoAccount.organization_name}`);
                        console.log(`[PAYFAST WEBHOOK] Hostname: ${duoAccount.api_hostname}\n`);
                    } else {
                        console.log(`\n[PAYFAST WEBHOOK] ⚠️ DUO PROVISIONING SKIPPED (No valid config)\n`);
                    }
                } catch (duoErr) {
                    console.error(`\n[PAYFAST WEBHOOK] ❌ DUO PROVISIONING ERROR`);
                    console.error(`[PAYFAST WEBHOOK] Error:`, duoErr.message);
                    console.error(`[PAYFAST WEBHOOK] (Payment already confirmed, continuing with webhook)\n`);
                    // Don't fail the whole webhook - payment already confirmed
                }
            } else {
                console.log('[PAYFAST WEBHOOK] ℹ️ No Duo items found - skipping Duo provisioning');
            }

            // 5. Send Confirmation Email (Async)
            if (order) {
                console.log('[PAYFAST WEBHOOK] Step 6: Queuing confirmation email...');
                // You can reuse your existing email logic here
                // sendOrderConfirmationEmail(order).catch(err => console.error('Email error:', err));
            }

            console.log('\n[PAYFAST WEBHOOK] ===============================================');
            console.log('[PAYFAST WEBHOOK] ✅ WEBHOOK PROCESSING COMPLETE');
            console.log('[PAYFAST WEBHOOK] ===============================================\n');
            
            res.status(200).send('OK');
        } catch (err) {
            if (connection) await connection.rollback();
            console.error('[PAYFAST WEBHOOK] ❌ Database error:', err.message);
            console.error('[PAYFAST WEBHOOK] ===============================================\n');
            res.status(500).send('Internal Error');
        } finally {
            if (connection) connection.release();
        }
    } else {
        console.log(`[PAYFAST WEBHOOK] ℹ️ Payment status is "${paymentStatus}", not COMPLETE. Skipping processing.`);
        console.log('[PAYFAST WEBHOOK] ===============================================\n');
        res.status(200).send('OK');
    }
});

// 📦 GET AXIZ PRODUCT DETAILS
async function getAxizProductDetails(identifier, brandName) {
    try {
        const token = await getAxizToken();
        
        // 1. First search to get the correct brandId (enum)
        const searchRes = await axios.post(`${process.env.AXIZ_BASE_URL}/api/services/app/Products/SearchProducts`, {
            searchText: identifier,
            maxResultCount: 1,
            market: 14
        }, {
            headers: { 
                'Authorization': `Bearer ${token}`,
                'accountNumber': process.env.AXIZ_ACCOUNT_NUMBER
            }
        });

        const items = searchRes.data.result.items;
        if (!items || items.length === 0) return null;

        const brandId = items[0].brand; // Axiz returns brand as an ID in SearchProducts

        // 2. Now call FindProductById for comprehensive details
        const detailsRes = await axios.post(`${process.env.AXIZ_BASE_URL}/api/services/app/Products/FindProductById`, {
            brand: brandId,
            identifier: identifier,
            market: 14
        }, {
            headers: { 
                'Authorization': `Bearer ${token}`,
                'accountNumber': process.env.AXIZ_ACCOUNT_NUMBER
            }
        });

        return detailsRes.data.result;
    } catch (error) {
        console.error("Error fetching Axiz details:", error.response?.data || error.message);
        return null;
    }
}

// THE SYNC LOGIC
async function syncAxizProducts() {
    let connection;
    try {
        console.log("Starting Scheduled Sync Quest... 🛡️");
        const token = await getAxizToken();
        connection = await db.getConnection();
        await ensureSupplierTrackingSchema(connection);

        // We only want hardware, no accessories
        const searchTerms = ["Notebook", "Desktop"];
        let allItems = [];

        for (const term of searchTerms) {
            const axizRes = await axios.post(`${process.env.AXIZ_BASE_URL}/api/services/app/Products/SearchProducts`, {
                searchText: term,
                maxResultCount: 100,
                market: 14
            }, {
                headers: { 'Authorization': `Bearer ${token}`, 'accountNumber': process.env.AXIZ_ACCOUNT_NUMBER }
            });
            if (axizRes.data.result?.items) allItems = allItems.concat(axizRes.data.result.items);
        }

        await connection.beginTransaction();

        for (const item of allItems) {
            if (shouldSkipStoreSyncItem(item.name)) continue;

            const brandName = (item.brandInfo?.brandName || 'LAPTOP').toUpperCase();
            const retailPrice = await getRetailPrice(item.price, brandName);
            
            // Get full Axiz details for comprehensive data and images
            const axizDetails = await getAxizProductDetails(item.productIdentifier, brandName);
            
            // CLEAN NAME: Remove specs using Regex for a professional look
            let cleanedTitle = item.name.split('/')[0]
                .replace(/\d+GB|\d+TB|SSD|HDD|i[3579]|Ryzen \d/gi, '')
                .replace(/  +/g, ' ').trim();

            // EXTRACT SPECS for the database columns
            const processor = item.name.match(/i\d|Ryzen \d/i)?.[0] || 'Unknown';
            const description = axizDetails?.additionalInfo?.LongDescription || item.additionalInfo?.LongDescription || item.description || "High-performance computing module.";

            // DEDUPLICATION: Use INSERT...ON DUPLICATE KEY UPDATE for clean handling
            const [result] = await connection.query(
                `INSERT INTO products (product_number, product_name, description, price, warehouse_price, quantity, brand, processor, supplier_source, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
                 ON DUPLICATE KEY UPDATE
                 product_name = VALUES(product_name),
                 description = VALUES(description),
                 price = VALUES(price),
                 warehouse_price = VALUES(warehouse_price),
                 quantity = VALUES(quantity),
                 processor = VALUES(processor),
                 supplier_source = VALUES(supplier_source),
                 updated_at = NOW()`,
                [item.productIdentifier, cleanedTitle, description, retailPrice, item.price, item.availableToSell, brandName, processor, 'Axiz']
            );
            
            const productId = result.insertId > 0 ? result.insertId : (await connection.query("SELECT id FROM products WHERE product_number = ?", [item.productIdentifier]))[0][0]?.id;

            // Save Images from Axiz details
            if (axizDetails?.productImageGallery && axizDetails.productImageGallery.length > 0) {
                // Delete existing images to avoid duplicates
                await connection.query("DELETE FROM product_images WHERE product_id = ?", [productId]);
                for (let i = 0; i < axizDetails.productImageGallery.length; i++) {
                    const img = axizDetails.productImageGallery[i];
                    await connection.query(
                        "INSERT INTO product_images (product_id, image_url, is_primary, sort_order) VALUES (?, ?, ?, ?)",
                        [productId, img.imageUrl, i === 0, i]
                    );
                }
            } else if (item.imageUrl) {
                // Fallback to single image from search
                await connection.query(
                    "INSERT IGNORE INTO product_images (product_id, image_url, is_primary, sort_order) VALUES (?, ?, ?, ?)",
                    [productId, item.imageUrl, true, 0]
                );
            }
        }

        await connection.commit();
        console.log("Sync Quest Complete! 🏹");
    } catch (error) {
        if (connection) await connection.rollback();
        console.error("Sync Failed! ❌", error.message);
    } finally {
        if (connection) connection.release();
    }
}

// Set up hourly sync (3600000 ms)
setInterval(syncAxizProducts, 3600000);

// Initial sync on startup
syncAxizProducts().catch(err => console.error("Initial sync failed:", err));

// Routes
app.post('/api/v1/sync-axiz', async (req, res) => {
    await syncAxizProducts();
    res.status(200).json({ status: 'success', message: 'Inventory Synced' });
});

// ============================================================================//
//                    CORE GROUP API INTEGRATION                               //
// ============================================================================//

// ============ PRODUCT INFORMATION EXTRACTION UTILITIES ============
// Extract clean product name from description (e.g., "MacBook Air 13-inch" from long description)
function extractCleanProductName(description) {
    if (!description) return "Product";
    const desc = String(description).trim();
    
    // For Apple products, try to extract model info
    const applePatterns = [
        /MacBook\s+(Air|Pro|M\w+)\s+\d+/i,
        /iPad\s+(Pro|Air|Mini)\s+\d+/i,
        /iPhone\s+\d+/i,
        /Apple\s+Watch\s+(Series\s+\d+|Ultra|SE)?/i,
        /AirPods\s+(Pro|Max)?/i,
        /iMac\s+\d+/i
    ];
    
    for (const pattern of applePatterns) {
        const match = desc.match(pattern);
        if (match) return match[0].trim();
    }
    
    // Fallback: use first 5 words
    return desc.split(/\s+/).slice(0, 5).join(' ');
}

// Extract product type from description
function extractProductType(description) {
    if (!description) return "Electronics";
    const desc = String(description).toLowerCase();
    
    const typePatterns = [
        { keywords: ['macbook', 'laptop', 'notebook'], type: 'Laptop' },
        { keywords: ['ipad', 'tablet'], type: 'Tablet' },
        { keywords: ['iphone', 'phone', 'smartphone'], type: 'Smartphone' },
        { keywords: ['watch', 'smartwatch', 'wrist'], type: 'Smart Watch' },
        { keywords: ['airpods', 'earbuds', 'headphones'], type: 'Wireless Headphones' },
        { keywords: ['imac', 'mac mini', 'mac studio', 'desktop'], type: 'Desktop Computer' },
        { keywords: ['monitor', 'display'], type: 'Monitor' },
        { keywords: ['keyboard'], type: 'Keyboard' },
        { keywords: ['trackpad', 'mouse'], type: 'Mouse/Trackpad' }
    ];
    
    for (const item of typePatterns) {
        if (item.keywords.some(kw => desc.includes(kw))) {
            return item.type;
        }
    }
    
    return "Electronics";
}

// Extract brand from description (improved)
function extractBrand(description) {
    if (!description) return "APPLE";
    const desc = String(description);
    
    const brandPatterns = [
        { keywords: ['macbook', 'iphone', 'ipad', 'airpods', 'imac', 'apple watch'], brand: 'APPLE' },
        { keywords: ['hp ', 'hewlett-packard'], brand: 'HP' },
        { keywords: ['dell'], brand: 'DELL' },
        { keywords: ['lenovo', 'thinkpad'], brand: 'LENOVO' },
        { keywords: ['asus'], brand: 'ASUS' },
        { keywords: ['acer'], brand: 'ACER' },
        { keywords: ['microsoft', 'surface'], brand: 'MICROSOFT' },
        { keywords: ['samsung'], brand: 'SAMSUNG' }
    ];
    
    const lowerDesc = desc.toLowerCase();
    for (const item of brandPatterns) {
        if (item.keywords.some(kw => lowerDesc.includes(kw))) {
            return item.brand;
        }
    }
    
    // Default detection for Apple products
    if (desc.match(/(MacBook|iPad|iPhone|AirPods|iMac|Apple Watch)/i)) {
        return 'APPLE';
    }
    
    return 'APPLE';
}

// Fetch products from Core Group API
async function getCoreGroupProducts() {
    const coreApiUrl = process.env.CORE_API_URL;
    if (!coreApiUrl) {
        throw new Error('CORE_API_URL is not configured');
    }

    const response = await axios.get(coreApiUrl, {
        timeout: 30000,
        headers: { Accept: 'application/json' }
    });
    const items = response.data?.Root?.DataFeed;

    if (!Array.isArray(items)) {
        throw new Error('Core API returned an unexpected response format');
    }

    console.log(`[CORE API] Received ${items.length} products`);
    return items;
}

// ============ TARSUS ONLINE API INTEGRATION ============
// Cache for Tarsus products when API is rate-limited
let tarsonProductsCache = {
    data: [],
    lastFetch: 0,
    cacheExpiry: 2 * 60 * 60 * 1000  // 2 hour cache
};

// Fetch products from Tarsus Online API with smart retry logic
async function getTarsonProducts() {
    const MAX_RETRIES = 3;
    const BASE_DELAY = 30000; // 30 seconds between retries (respects API rate limiting)
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const tarsonUrl = process.env.TARSON_API_URL;
            const tarsonToken = process.env.TARSON_API_TOKEN;
            
            if (!tarsonUrl || !tarsonToken) {
                throw new Error('TARSON_API_URL or TARSON_API_TOKEN not configured in .env');
            }
            
            console.log(`[TARSUS API] Attempt ${attempt}/${MAX_RETRIES}: Fetching products...`);
            
            const response = await axios.get(tarsonUrl, {
                headers: {
                    'Authorization': `Bearer ${tarsonToken}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                    'Cache-Control': 'no-cache'
                },
                timeout: 30000,  // 30 second timeout for large response
                maxContentLength: 50 * 1024 * 1024  // Allow up to 50MB
            });
            
            // Handle different response status codes
            if (response.status === 403) {
                const delayMs = BASE_DELAY * Math.pow(2, attempt - 1);  // Exponential backoff
                if (attempt < MAX_RETRIES) {
                    console.warn(`[TARSUS API] Rate limited (403). Waiting ${delayMs}ms before retry...`);
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                    continue;
                } else {
                    console.error("[TARSUS API] Rate limited after 3 attempts. Using cached data if available.");
                    if (tarsonProductsCache.data.length > 0) {
                        console.log(`[TARSUS API] Using cached data: ${tarsonProductsCache.data.length} products`);
                        return tarsonProductsCache.data;
                    }
                    return [];
                }
            }
            
            if (response.status !== 200) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            // Parse response - it's already a JSON object from axios
            const data = response.data;
            console.log(`[TARSUS API] Got response, parsing for products...`);
            
            // Try multiple paths for finding products
            let items = [];
            
            if (Array.isArray(data)) {
                items = data;
                console.log(`[TARSUS API] Found products at root level: ${items.length} items`);
            } else if (data.products && Array.isArray(data.products)) {
                items = data.products;
                console.log(`[TARSUS API] Found products at .products: ${items.length} items`);
            } else if (data.data && Array.isArray(data.data)) {
                items = data.data;
                console.log(`[TARSUS API] Found products at .data: ${items.length} items`);
            } else if (data.result && Array.isArray(data.result)) {
                items = data.result;
                console.log(`[TARSUS API] Found products at .result: ${items.length} items`);
            } else if (data.ProductCatalogue && Array.isArray(data.ProductCatalogue)) {
                items = data.ProductCatalogue;
                console.log(`[TARSUS API] Found products at .ProductCatalogue: ${items.length} items`);
            } else if (data.items && Array.isArray(data.items)) {
                items = data.items;
                console.log(`[TARSUS API] Found products at .items: ${items.length} items`);
            } else if (data.Products && Array.isArray(data.Products)) {
                // Capital P - common in some APIs
                items = data.Products;
                console.log(`[TARSUS API] Found products at .Products: ${items.length} items`);
            } else if (typeof data === 'object') {
                // Search in nested objects for product arrays
                for (const [key, value] of Object.entries(data)) {
                    if (Array.isArray(value) && value.length > 0) {
                        // Check if first item looks like a product
                        const firstItem = value[0];
                        if (typeof firstItem === 'object' && (
                            firstItem.name || firstItem.product_name || firstItem.title ||
                            firstItem.price || firstItem.sku || firstItem.category
                        )) {
                            items = value;
                            console.log(`[TARSUS API] Found products at .${key}: ${items.length} items`);
                            break;
                        }
                    }
                }
            }
            
            if (items.length === 0) {
                console.warn(`[TARSUS API] No product arrays found in response. Response keys: ${Object.keys(data).slice(0, 10).join(', ')}`);
            }
            
            console.log(`[TARSUS API] Extracted ${items.length} total products`);
            
            // Cache successful fetch
            if (items.length > 0) {
                tarsonProductsCache.data = items;
                tarsonProductsCache.lastFetch = Date.now();
                console.log(`[TARSUS API] Cached ${items.length} products`);
            }
            
            return items || [];
            
        } catch (error) {
            console.error(`[TARSUS API] Attempt ${attempt} failed: ${error.message}`);
            
            if (attempt === MAX_RETRIES) {
                // Final attempt failed - use cache if available
                if (error.response?.status === 403) {
                    console.error("[TARSUS API] Rate limit persists after retries.");
                    if (tarsonProductsCache.data.length > 0) {
                        console.log(`[TARSUS API] Using cached data: ${tarsonProductsCache.data.length} products (cached ${Math.round((Date.now() - tarsonProductsCache.lastFetch) / 60000)} minutes ago)`);
                        return tarsonProductsCache.data;
                    }
                } else if (error.code === 'ENOTFOUND') {
                    console.error("[TARSUS API] DNS resolution failed - check URL and network connectivity");
                    if (tarsonProductsCache.data.length > 0) {
                        console.log(`[TARSUS API] Using cached data: ${tarsonProductsCache.data.length} products`);
                        return tarsonProductsCache.data;
                    }
                } else {
                    console.error("[TARSUS API] Final error:", error.message);
                }
                return [];
            }
            
            // Wait before retry
            const delayMs = BASE_DELAY * Math.pow(2, attempt - 1);
            console.log(`[TARSUS API] Retrying in ${delayMs}ms...`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
    
    return [];
}

// Filter products for laptops only
function filterLaptopsOnly(products) {
    return products.filter(product => {
        // PRIMARY: Only match actual laptop/notebook types (most reliable)
        const productType = (product.Product_Type || product.product_type || product.Type || '').toLowerCase();
        
        // Only include products where Product_Type explicitly indicates it's a laptop/notebook/computer
        return productType.includes('laptop') || 
               productType.includes('notebook') || 
               productType.includes('macbook') ||
               productType.includes('computer');
    });
}

function shouldSkipStoreSyncItem(...values) {
    const text = values
        .filter(Boolean)
        .map(value => String(value).toLowerCase())
        .join(' ');

    return /\bscrews?\b/i.test(text) ||
        text.includes('legion branded combination notebook') ||
        text.includes('legion notebook combination nano');
}

// Extract laptop specs from Tarson product data
function extractLaptopSpecs(product) {
    const specs = {};
    
    // Combine all text fields to search for specs
    const fullText = Object.values(product)
        .map(v => {
            if (typeof v === 'string') return v;
            if (typeof v === 'number') return String(v);
            return '';
        })
        .join(' ')
        .toLowerCase();
    
    // RAM extraction
    const ramMatch = fullText.match(/(\d+)\s*gb\s*ram/i) || fullText.match(/ram\s*:?\s*(\d+)\s*gb/i);
    if (ramMatch) specs.ram = `${ramMatch[1]}GB RAM`;
    
    // Storage extraction
    const storageMatch = fullText.match(/(\d+)\s*(?:gb|tb)\s*(?:ssd|hdd|storage)/i) || 
                         fullText.match(/storage:?\s*(\d+)\s*(?:gb|tb)/i);
    if (storageMatch) specs.storage = `${storageMatch[1]}GB Storage`;
    
    // Processor extraction
    const procMatch = fullText.match(/(intel\s+core\s+i\d+|amd\s+ryzen\s+\d+|apple\s+m\d+|m\d+\w*)/i);
    if (procMatch) specs.processor = procMatch[1].trim();
    
    return specs;
}

// Sync Tarsus Online products to database
async function syncTarsonProducts() {
    let connection;
    const newProducts = [];
    try {
        console.log("[TARSUS] Starting sync with full catalogue filter...");
        connection = await db.getConnection();
        await ensureSupplierTrackingSchema(connection);
        const allItems = await getTarsonProducts();
        
        const storeItems = allItems.filter(item => !shouldSkipStoreSyncItem(
            item.Product_Name,
            item.product_name,
            item.Description,
            item.description,
            item.SKU,
            item.sku,
            item.Product_Type,
            item.product_type
        ));
        console.log(`[TARSUS] Syncing ${storeItems.length} products from ${allItems.length} total products`);
        
        await connection.beginTransaction();
        
        for (const item of storeItems) {
            // Extract fields using the supplier's actual field names.
            const sku = item.Product_Number || item.product_number || item.sku || item.code || item.product_code || 
                       item.SKU || item.Code || item.ProductCode || item.ProductId || item.product_id || `TARSUS-${Date.now()}`;
            
            const productName = item.Product_Description || item.product_description || item.name || item.product_name || 
                               item.title || item.Name || item.ProductName || item.Title || item.product_title || item.ProductTitle;
            
            if (!sku || !productName) {
                console.log("[TARSUS] Skipping item with missing SKU or name");
                continue;
            }
            
            const description = item.Product_Description || item.product_description || item.Description || 
                               item.ProductDescription || item.product_description || productName;
            
            const price = parseFloat(item.Price_ex_Vat || item.price_ex_vat || item.Price || item.price || 
                                    item.SellingPrice || item.selling_price || item.SalePrice || item.sale_price || 
                                    item.list_price || item.ListPrice || 0);
            
            const quantity = parseInt(item.Available_Stock || item.available_stock || item.Quantity || item.quantity || 
                                     item.stock || item.Stock || item.available_quantity || item.AvailableQuantity || 0);
            
            const brand = item.Manufacturer || item.manufacturer || item.brand || item.Brand || item.Brand || 'Unknown';
            
            // Skip if price is 0 or invalid
            if (price <= 0) {
                console.log(`[TARSUS] Skipping ${productName} - invalid price`);
                continue;
            }
            
            // Extract laptop specs
            const specs = extractLaptopSpecs(item);
            const cleanName = String(productName).split('|')[0].trim();
            
            // Check if product exists
            const [existing] = await connection.query(
                "SELECT id FROM products WHERE product_number = ? AND brand LIKE ?",
                [sku, `%${brand}%`]
            );
            
            if (existing.length > 0) {
                // Update existing
                await connection.query(
                    "UPDATE products SET quantity = ?, warehouse_price = ?, price = ?, description = ?, supplier_source = 'Tarsus', updated_at = NOW() WHERE product_number = ?",
                    [quantity, price, price, description, sku]
                );
            } else {
                // Insert new product as approved because this supplier feed is trusted.
                const [result] = await connection.query(
                    `INSERT INTO products (product_number, product_name, description, price, warehouse_price, quantity, brand, supplier_source, status, is_active)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [sku, cleanName, description, price, price, quantity, brand, 'Tarsus', 'approved', 1]
                );
                
                const productId = result.insertId;
                
                // Save product images if available.
                const imageUrl = item.Image_URL || item.image_url || item.ImageUrl || item.ImageURL ||
                                item.image || item.Image || item.img || item.Img || item.picture || item.Picture || 
                                item.photo || item.Photo || item.thumbnail || item.Thumbnail || item.image_link || item.ImageLink;
                if (imageUrl) {
                    try {
                        await connection.query(
                            "INSERT INTO product_images (product_id, image_url, is_primary, sort_order) VALUES (?, ?, ?, ?)",
                            [productId, imageUrl, true, 0]
                        );
                        console.log(`[TARSUS] Image saved for ${cleanName}`);
                    } catch (imgErr) {
                        console.warn(`[TARSUS] Failed to save image for ${cleanName}: ${imgErr.message}`);
                    }
                }

                
                newProducts.push({
                    id: productId,
                    sku: sku,
                    name: cleanName,
                    brand: brand,
                    price: price,
                    quantity: quantity,
                    specs: specs,
                    image: imageUrl
                });
            }
        }
        
        await connection.commit();
        console.log(`[TARSUS] Sync completed - ${newProducts.length} new laptops added`);
        
        // Send notification if new products
        if (newProducts.length > 0) {
            try {
                await sendNewTarsonProductsEmail(newProducts);
            } catch (emailErr) {
                console.error("[TARSUS] Email notification failed:", emailErr.message);
            }
        }
        
    } catch (error) {
        if (connection) await connection.rollback();
        console.error("[TARSUS] Sync failed:", error.message);
    } finally {
        if (connection) connection.release();
    }
}

// Email notification for new Tarsus products
async function sendNewTarsonProductsEmail(products) {
    const productsHTML = products.map((product, index) => `
        <tr style="border-bottom: 1px solid #ddd;">
            <td style="padding: 12px; text-align: left;">${index + 1}</td>
            <td style="padding: 12px; text-align: left;">${product.brand}</td>
            <td style="padding: 12px; text-align: left;">${product.name}</td>
            <td style="padding: 12px; text-align: center;">${product.quantity} units</td>
            <td style="padding: 12px; text-align: right;">R${parseFloat(product.price).toLocaleString()}</td>
        </tr>
    `).join('');
    
    const mailOptions = {
        from: `"${STORE_DETAILS.name}" <${EMAIL_SENDERS.sales}>`,
        to: EMAIL_SENDERS.sales,
        subject: `🆕 ${products.length} New Laptop(s) from Tarsus Online`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 900px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 24px; text-align: center; border-radius: 8px 8px 0 0;">
                    <h1 style="margin: 0; font-size: 28px;">💻 New Laptops from Tarsus Online</h1>
                    <p style="margin: 8px 0 0 0; font-size: 16px;">${products.length} laptop(s) added and live on store</p>
                </div>
                <div style="padding: 24px; background: white; border: 1px solid #ddd;">
                    <p style="color: #666; margin: 0 0 20px 0; font-size: 15px;">
                        New laptops have been automatically synced from Tarsus Online and are <strong>already live on your store</strong>.
                    </p>
                    <h2 style="margin: 20px 0 16px 0; color: #1a202c; border-bottom: 2px solid #667eea; padding-bottom: 12px;">New Laptop Summary</h2>
                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
                        <thead>
                            <tr style="background: #f0f0f0;">
                                <th style="padding: 12px; text-align: left; border-bottom: 2px solid #ddd;">#</th>
                                <th style="padding: 12px; text-align: left; border-bottom: 2px solid #ddd;">Brand</th>
                                <th style="padding: 12px; text-align: left; border-bottom: 2px solid #ddd;">Model</th>
                                <th style="padding: 12px; text-align: center; border-bottom: 2px solid #ddd;">Stock</th>
                                <th style="padding: 12px; text-align: right; border-bottom: 2px solid #ddd;">Price</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${productsHTML}
                        </tbody>
                    </table>
                    <div style="background: #eef2ff; border-left: 4px solid #667eea; padding: 16px; margin: 20px 0; border-radius: 4px;">
                        <p style="margin: 0; color: #4c51bf; font-size: 14px;">
                            <strong>✓ Status:</strong> These laptops are automatically approved and live on your store. Check them out!
                        </p>
                    </div>
                </div>
            </div>
        `
    };
    
    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`[TARSUS EMAIL] Sent: ${info.messageId}`);
    } catch (err) {
        console.error(`[TARSUS EMAIL] Failed:`, err);
    }
}

// Sync Core API products to database. Manual resets can return the catalogue to review.
async function syncCoreGroupProducts({ resetToPending = false } = {}) {
    let connection;
    const newProducts = []; // Track newly added products for email
    let updatedProducts = 0;
    let skippedProducts = 0;
    let resetProducts = 0;
    try {
        console.log("[CORE API] Starting sync with enhanced product extraction...");
        const items = await getCoreGroupProducts();
        connection = await db.getConnection();
        await ensureSupplierTrackingSchema(connection);

        await connection.beginTransaction();

        if (resetToPending) {
            const [resetResult] = await connection.query(`
                UPDATE products
                SET status = 'pending',
                    is_active = 0,
                    updated_at = NOW()
                WHERE supplier_source = 'Core'
                   OR (supplier_source IS NULL
                       AND brand IN ('APPLE', 'IPHONE', 'IPAD', 'MACBOOK', 'AIRPODS', 'IMAC', 'MAC', 'IWATCH'))
            `);
            resetProducts = resetResult.affectedRows || 0;
            console.log(`[CORE API] Reset ${resetProducts} Core products to pending review`);
        }

        for (const item of items) {
            // Validate required fields
            if (!item.StockCode || !item.Description) {
                console.log("[CORE API] Skipping item with missing StockCode or Description");
                skippedProducts += 1;
                continue;
            }

            // Convert Description to string safely
            const descriptionStr = String(item.Description || '');
            
            const description = descriptionStr.toLowerCase();
            if (shouldSkipStoreSyncItem(descriptionStr, item.StockCode)) {
                skippedProducts += 1;
                continue;
            }

            // ===== ENHANCED EXTRACTION =====
            const cleanProductName = extractCleanProductName(descriptionStr);
            const productType = extractProductType(descriptionStr);
            const brandName = extractBrand(descriptionStr);
            
            // Use promo price if available, otherwise standard price
            const standardPrice = String(item.StandardPrice).replace(/,/g, '');
            const promoPrice = item.PromoPrice ? String(item.PromoPrice).replace(/,/g, '') : standardPrice;
            const price = parseFloat(promoPrice) || parseFloat(standardPrice) || 0;
            
            // Check if product already exists
            // Use INSERT...ON DUPLICATE KEY UPDATE to handle duplicates and ensure clean sync
            const [result] = await connection.query(
                `INSERT INTO products (product_number, product_name, description, price, warehouse_price, quantity, brand, supplier_source, status, is_active, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
                 ON DUPLICATE KEY UPDATE
                 product_name = VALUES(product_name),
                 description = VALUES(description),
                 price = VALUES(price),
                 warehouse_price = VALUES(warehouse_price),
                 quantity = VALUES(quantity),
                 brand = VALUES(brand),
                 supplier_source = VALUES(supplier_source),
                 updated_at = NOW()`,
                [item.StockCode, cleanProductName, descriptionStr, price, price, Math.floor(item.StockOnHand || 0), brandName, 'Core', 'pending', 0]
            );

            // Only count as new if insert was successful (not updated)
            if (result.affectedRows === 1 && result.insertId > 0) {
                newProducts.push({
                    id: result.insertId,
                    stockCode: item.StockCode,
                    name: cleanProductName,
                    type: productType,
                    brand: brandName,
                    price: price,
                    quantity: Math.floor(item.StockOnHand || 0)
                });
            } else {
                updatedProducts += 1;
            }
        }

        const summary = {
            fetched: items.length,
            added: newProducts.length,
            updated: updatedProducts,
            skipped: skippedProducts,
            inStock: items.filter(item => Number(item.StockOnHand) > 0).length,
            reset: resetProducts
        };

        await connection.query(
            `INSERT INTO supplier_sync_status
                (supplier, last_success_at, fetched_count, in_stock_count, added_count, updated_count, skipped_count, last_error)
             VALUES ('Core', NOW(), ?, ?, ?, ?, ?, NULL)
             ON DUPLICATE KEY UPDATE
                last_success_at = VALUES(last_success_at),
                fetched_count = VALUES(fetched_count),
                in_stock_count = VALUES(in_stock_count),
                added_count = VALUES(added_count),
                updated_count = VALUES(updated_count),
                skipped_count = VALUES(skipped_count),
                last_error = NULL`,
            [summary.fetched, summary.inStock, summary.added, summary.updated, summary.skipped]
        );

        await connection.commit();
        console.log(`[CORE API] Sync completed successfully: ${JSON.stringify(summary)}`);

        // Send email notification if new products were added
        if (newProducts.length > 0) {
            try {
                await sendNewCoreProductsEmail(newProducts);
            } catch (emailErr) {
                console.error("[CORE API] Error sending notification email:", emailErr.message);
                // Don't fail the sync if email fails
            }
        }

        return summary;
    } catch (error) {
        if (connection) await connection.rollback();
        const status = error.response?.status;
        const detail = status ? `HTTP ${status}: ${error.message}` : error.message;
        console.error("[CORE API] Sync failed:", detail);
        throw new Error(detail);
    } finally {
        if (connection) connection.release();
    }
}

// Email notification for new Core API products
async function sendNewCoreProductsEmail(products) {
    const productsHTML = products.map((product, index) => `
        <tr style="border-bottom: 1px solid #ddd;">
            <td style="padding: 12px; text-align: left;">${index + 1}</td>
            <td style="padding: 12px; text-align: left;">${product.brand}</td>
            <td style="padding: 12px; text-align: left;">${product.name}</td>
            <td style="padding: 12px; text-align: center;">${product.type}</td>
            <td style="padding: 12px; text-align: center;">${product.quantity}</td>
            <td style="padding: 12px; text-align: right;">R${parseFloat(product.price).toLocaleString()}</td>
        </tr>
    `).join('');

    const mailOptions = {
        from: `"${STORE_DETAILS.name}" <${EMAIL_SENDERS.sales}>`,
        to: EMAIL_SENDERS.sales,
        subject: `🆕 ${products.length} New Core API Product(s) Added - Action Required`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 900px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #f59e0b 0%, #f97316 100%); color: white; padding: 24px; text-align: center; border-radius: 8px 8px 0 0;">
                    <h1 style="margin: 0; font-size: 28px;">🆕 New Products from Core API</h1>
                    <p style="margin: 8px 0 0 0; font-size: 16px;">${products.length} product(s) requiring your attention</p>
                </div>
                
                <div style="padding: 24px; background: white; border: 1px solid #ddd;">
                    <p style="color: #666; margin: 0 0 20px 0; font-size: 15px;">
                        New products have been automatically added from the Core Group API and are awaiting your approval. 
                        <strong>Please add product images and approve them to make them live on your store.</strong>
                    </p>

                    <h2 style="margin: 20px 0 16px 0; color: #1a202c; border-bottom: 2px solid #f59e0b; padding-bottom: 12px;">New Products Summary</h2>
                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
                        <thead>
                            <tr style="background: #fef3c7;">
                                <th style="padding: 12px; text-align: left; border-bottom: 2px solid #ddd;">#</th>
                                <th style="padding: 12px; text-align: left; border-bottom: 2px solid #ddd;">Brand</th>
                                <th style="padding: 12px; text-align: left; border-bottom: 2px solid #ddd;">Product Name</th>
                                <th style="padding: 12px; text-align: center; border-bottom: 2px solid #ddd;">Type</th>
                                <th style="padding: 12px; text-align: center; border-bottom: 2px solid #ddd;">Qty</th>
                                <th style="padding: 12px; text-align: right; border-bottom: 2px solid #ddd;">Price</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${productsHTML}
                        </tbody>
                    </table>

                    <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 20px 0; border-radius: 4px;">
                        <p style="margin: 0; color: #b45309; font-size: 14px;">
                            <strong>⚠️ Action Required:</strong> These products are pending approval. 
                            Upload at least one image for each product, then approve them in the Admin Panel to make them live.
                        </p>
                    </div>

                    <div style="margin: 24px 0; text-align: center;">
                        <a href="http://localhost:3000/admin_core_products.html" style="display: inline-block; padding: 12px 24px; background: #f59e0b; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">
                            Go to Core Products Admin
                        </a>
                    </div>

                    <p style="color: #718096; font-size: 12px; margin: 24px 0 0 0; text-align: center; border-top: 1px solid #ddd; padding-top: 12px;">
                        This is an automated notification from your inventory system. No reply needed.
                    </p>
                </div>
            </div>
        `
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`[CORE API EMAIL] Notification sent successfully: ${info.messageId}`);
        return true;
    } catch (err) {
        console.error(`[CORE API EMAIL] Error sending email:`, err);
        throw err;
    }
}

// Set up hourly sync for Core API (1 hour = 3600000ms)
setInterval(() => {
    syncCoreGroupProducts().catch(err => console.error("[CORE API] Scheduled sync failed:", err.message));
}, 3600000);

// Initial sync on startup
syncCoreGroupProducts().catch(err => console.error("[CORE API] Initial sync failed:", err));

// Set up sync for Tarsus Online (every 2 hours = 7200000ms - respecting aggressive API rate limits)
console.log("[TARSUS] Sync scheduled every 2 hours (API is rate-limited, cache enabled)");
setInterval(syncTarsonProducts, 7200000);

// Initial Tarsus sync on startup (with 60s delay to let other APIs go first).
setTimeout(() => {
    syncTarsonProducts().catch(err => console.error("[TARSUS] Initial sync failed:", err));
}, 60000);

// Route: Manual sync Core products
app.post('/api/v1/sync-core', async (req, res, next) => {
    try {
        const summary = await syncCoreGroupProducts({ resetToPending: true });
        res.status(200).json({
            status: 'success',
            message: `Core sync complete: ${summary.reset} products reset to pending, ${summary.fetched} fetched, ${summary.inStock} in stock.`,
            data: { summary }
        });
    } catch (error) {
        next(new AppError(`Core sync failed: ${error.message}`, 502));
    }
});

// Route: Manual sync Tarsus products. The legacy URL remains for compatibility.
app.post('/api/v1/sync-tarson', async (req, res) => {
    await syncTarsonProducts();
    res.status(200).json({ status: 'success', message: 'Tarsus products synced' });
});

// Route: Get Tarsus sync status and stats. The legacy URL remains for compatibility.
app.get('/api/v1/tarson-status', async (req, res, next) => {
    let connection;
    try {
        connection = await db.getConnection();
        
        await ensureSupplierTrackingSchema(connection);

        const [tarsonStats] = await connection.query(`
            SELECT 
                COUNT(*) as total_products,
                SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_products,
                SUM(CASE WHEN quantity > 0 THEN 1 ELSE 0 END) as in_stock,
                MIN(price) as lowest_price,
                MAX(price) as highest_price,
                AVG(price) as avg_price
            FROM products p
            WHERE p.supplier_source = 'Tarsus'
            AND p.status = 'approved'
        `);
        
        connection.release();
        
        res.status(200).json({
            status: 'success',
            data: {
                source: 'Tarsus Online',
                stats: tarsonStats[0] || {
                    total_products: 0,
                    active_products: 0,
                    in_stock: 0
                }
            }
        });
    } catch (err) {
        if (connection) connection.release();
        next(err);
    }
});

// Route: Get pending Core API products
app.get('/api/v1/core-products/pending', async (req, res, next) => {
    let connection;
    try {
        connection = await db.getConnection();
        await ensureSupplierTrackingSchema(connection);
        const [products] = await connection.query(
            `SELECT p.id, p.product_number, p.product_name, p.description, p.price, p.quantity, p.brand,
                    p.supplier_source, p.status, p.updated_at,
                    COUNT(pi.id) as image_count
             FROM products p 
             LEFT JOIN product_images pi ON p.id = pi.product_id
             WHERE p.status = 'pending'
               AND p.quantity > 0
               AND p.price > 0
               AND (p.supplier_source = 'Core'
                    OR (p.supplier_source IS NULL AND p.brand IN ('APPLE', 'IPHONE', 'IPAD', 'MACBOOK', 'AIRPODS', 'IMAC', 'MAC', 'IWATCH')))
             GROUP BY p.id
             ORDER BY p.created_at DESC`
        );
        
        connection.release();
        res.status(200).json({ status: 'success', data: { products } });
    } catch (err) {
        if (connection) connection.release();
        next(err);
    }
});

// Route: Get approved Core products
app.get('/api/v1/core-products/approved/list', async (req, res, next) => {
    let connection;
    try {
        connection = await db.getConnection();
        await ensureSupplierTrackingSchema(connection);
        const [products] = await connection.query(
            `SELECT p.id, p.product_number, p.product_name, p.description, p.price, p.quantity, p.brand,
                    p.supplier_source, p.status, p.is_active, p.updated_at,
                    COUNT(pi.id) as image_count
             FROM products p 
             LEFT JOIN product_images pi ON p.id = pi.product_id
             WHERE p.status = 'approved'
               AND p.quantity > 0
               AND p.price > 0
               AND (p.supplier_source = 'Core'
                    OR (p.supplier_source IS NULL AND p.brand IN ('APPLE', 'IPHONE', 'IPAD', 'MACBOOK', 'AIRPODS', 'IMAC', 'MAC', 'IWATCH')))
             GROUP BY p.id
             HAVING COUNT(pi.id) > 0
             ORDER BY p.created_at DESC`
        );
        
        connection.release();
        res.status(200).json({ status: 'success', data: { products } });
    } catch (err) {
        if (connection) connection.release();
        next(err);
    }
});

// Route: Get rejected Core products
app.get('/api/v1/core-products/rejected/list', async (req, res, next) => {
    let connection;
    try {
        connection = await db.getConnection();
        await ensureSupplierTrackingSchema(connection);
        const [products] = await connection.query(
            `SELECT p.id, p.product_number, p.product_name, p.description, p.price, p.quantity, p.brand,
                    p.supplier_source, p.status, p.is_active, p.updated_at,
                    COUNT(pi.id) as image_count
             FROM products p
             LEFT JOIN product_images pi ON p.id = pi.product_id
             WHERE p.status = 'rejected'
               AND p.quantity > 0
               AND p.price > 0
               AND (p.supplier_source = 'Core'
                    OR (p.supplier_source IS NULL AND p.brand IN ('APPLE', 'IPHONE', 'IPAD', 'MACBOOK', 'AIRPODS', 'IMAC', 'MAC', 'IWATCH')))
             GROUP BY p.id
             ORDER BY p.updated_at DESC`
        );

        connection.release();
        res.status(200).json({ status: 'success', data: { products } });
    } catch (err) {
        if (connection) connection.release();
        next(err);
    }
});

// Route: Get images for a Core product
app.get('/api/v1/core-products/:productId/images', async (req, res, next) => {
    let connection;
    try {
        connection = await db.getConnection();
        const productId = req.params.productId;
        console.log(`[Images GET] Fetching images for product: ${productId}`);
        
        const [images] = await connection.query(
            'SELECT id, product_id, image_url, is_primary, sort_order FROM product_images WHERE product_id = ? ORDER BY sort_order',
            [productId]
        );
        
        console.log(`[Images GET] Found ${images.length} image(s) for product ${productId}`);
        images.forEach((img, i) => {
            console.log(`  [Images GET]   Image ${i+1}: ${img.image_url} (product_id: ${img.product_id})`);
        });
        
        connection.release();
        res.status(200).json({ status: 'success', data: { images } });
    } catch (err) {
        console.error(`[Images GET] ERROR:`, err.message);
        if (connection) connection.release();
        next(err);
    }
});

// Route: Upload images for Core product
app.post('/api/v1/core-products/:productId/images', upload.array('images', 10), async (req, res, next) => {
    let connection;
    try {
        const productId = req.params.productId;
        const files = req.files;

        console.log(`\n[Upload] ========== IMAGE UPLOAD REQUEST ==========`);
        console.log(`[Upload] Product ID: ${productId}`);
        console.log(`[Upload] Files received: ${files ? files.length : 'NONE'}`);
        
        if (files && files.length > 0) {
            files.forEach((f, i) => {
                console.log(`[Upload]   File ${i+1}: ${f.filename} (${f.size} bytes, mimetype: ${f.mimetype})`);
            });
        }

        if (!files || files.length === 0) {
            console.log(`[Upload] ERROR: No files in request`);
            return next(new AppError('No files uploaded', 400));
        }

        connection = await db.getConnection();
        await connection.beginTransaction();
        console.log(`[Upload] ✓ Database connection acquired`);

        for (let i = 0; i < files.length; i++) {
            const filename = files[i].filename;
            const isPrimary = i === 0 ? 1 : 0;
            console.log(`[Upload] → Inserting image ${i+1}/${files.length}: ${filename}`);
            
            await connection.query(
                'INSERT INTO product_images (product_id, image_url, is_primary, sort_order) VALUES (?, ?, ?, ?)',
                [productId, filename, isPrimary, i]
            );
            console.log(`[Upload]   ✓ Row inserted successfully`);
        }

        await connection.commit();
        console.log(`[Upload] ✓ TRANSACTION COMMITTED - ${files.length} image(s) saved`);
        connection.release();

        const responseData = {
            status: 'success',
            message: `${files.length} image(s) uploaded successfully`,
            imagesUploaded: files.length,
            productId: productId,
            filenames: files.map(f => f.filename)
        };
        
        console.log(`[Upload] ✓ Sending response:`, responseData);
        console.log(`[Upload] ===========================================\n`);
        
        res.status(201).json(responseData);
        
    } catch (err) {
        console.error(`[Upload] ✗ ERROR:`, err.message);
        console.error(`[Upload] Stack:`, err.stack);
        
        if (connection) {
            try {
                await connection.rollback();
                console.log(`[Upload] ✓ Transaction rolled back`);
            } catch (rollbackErr) {
                console.error(`[Upload] Failed to rollback:`, rollbackErr.message);
            }
            connection.release();
        }
        next(err);
    }
});

// Route: Approve Core product (move to active)
app.patch('/api/v1/core-products/:productId/approve', async (req, res, next) => {
    let connection;
    try {
        const productId = req.params.productId;
        connection = await db.getConnection();
        
        // Get product details
        const [products] = await connection.query('SELECT * FROM products WHERE id = ?', [productId]);
        if (products.length === 0) {
            connection.release();
            return next(new AppError('Product not found', 404));
        }

        const product = products[0];

        // Check if product has images
        const [images] = await connection.query(
            'SELECT COUNT(*) as count FROM product_images WHERE product_id = ?',
            [productId]
        );

        if (images[0].count === 0) {
            connection.release();
            return next(new AppError('Product must have at least one image before approval', 400));
        }

        // Update product status
        await connection.query(
            'UPDATE products SET status = ?, is_active = 1, updated_at = NOW() WHERE id = ?',
            ['approved', productId]
        );

        connection.release();

        // Send email notification
        try {
            const mailOptions = {
                from: `"${STORE_DETAILS.name}" <${EMAIL_SENDERS.sales}>`,
                to: EMAIL_SENDERS.sales,
                subject: `New Product Approved - ${product.product_name}`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 24px; text-align: center; border-radius: 8px 8px 0 0;">
                            <h1 style="margin: 0; font-size: 24px;">✓ Product Approved</h1>
                        </div>
                        
                        <div style="padding: 24px; background: white; border: 1px solid #eee;">
                            <h2 style="margin: 0 0 16px 0; color: #333;">New Product Activated</h2>
                            <p style="color: #666; margin: 0 0 12px 0;"><strong>Product Name:</strong> ${product.product_name}</p>
                            <p style="color: #666; margin: 0 0 12px 0;"><strong>Stock Code:</strong> ${product.product_number}</p>
                            <p style="color: #666; margin: 0 0 12px 0;"><strong>Price:</strong> R${parseFloat(product.price).toLocaleString()}</p>
                            <p style="color: #666; margin: 0 0 12px 0;"><strong>Quantity:</strong> ${product.quantity} units</p>
                            <p style="color: #666;"><strong>Status:</strong> <span style="color: #10b981; font-weight: bold;">ACTIVE</span></p>
                            
                            <p style="margin: 20px 0 0 0; color: #666; font-size: 14px;">The product is now live on your store and visible to customers.</p>
                        </div>
                    </div>
                `
            };

            await transporter.sendMail(mailOptions);
            console.log(`[EMAIL] Product approval notification sent for ${product.product_name}`);
        } catch (emailErr) {
            console.error('[EMAIL] Error sending approval notification:', emailErr);
            // Don't fail the API if email fails
        }

        res.status(200).json({
            status: 'success',
            message: 'Product approved and activated',
            data: { productId }
        });

    } catch (err) {
        if (connection) connection.release();
        next(err);
    }
});

// Route: Reject Core product
app.patch('/api/v1/core-products/:productId/reject', async (req, res, next) => {
    let connection;
    try {
        const productId = req.params.productId;
        const { reason } = req.body;

        connection = await db.getConnection();
        
        // Get product details
        const [products] = await connection.query('SELECT * FROM products WHERE id = ?', [productId]);
        if (products.length === 0) {
            connection.release();
            return next(new AppError('Product not found', 404));
        }

        const product = products[0];

        // Update product status
        await connection.query(
            'UPDATE products SET status = ?, updated_at = NOW() WHERE id = ?',
            ['rejected', productId]
        );

        connection.release();

        // Send rejection email
        try {
            const mailOptions = {
                from: `"${STORE_DETAILS.name}" <${EMAIL_SENDERS.sales}>`,
                to: EMAIL_SENDERS.sales,
                subject: `Product Rejected - ${product.product_name}`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <div style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 24px; text-align: center; border-radius: 8px 8px 0 0;">
                            <h1 style="margin: 0; font-size: 24px;">✗ Product Rejected</h1>
                        </div>
                        
                        <div style="padding: 24px; background: white; border: 1px solid #eee;">
                            <h2 style="margin: 0 0 16px 0; color: #333;">Product Not Approved</h2>
                            <p style="color: #666; margin: 0 0 12px 0;"><strong>Product Name:</strong> ${product.product_name}</p>
                            <p style="color: #666; margin: 0 0 12px 0;"><strong>Stock Code:</strong> ${product.product_number}</p>
                            ${reason ? `<p style="color: #666; margin: 0 0 12px 0;"><strong>Reason:</strong> ${reason}</p>` : ''}
                        </div>
                    </div>
                `
            };

            await transporter.sendMail(mailOptions);
            console.log(`[EMAIL] Product rejection notification sent for ${product.product_name}`);
        } catch (emailErr) {
            console.error('[EMAIL] Error sending rejection notification:', emailErr);
        }

        res.status(200).json({
            status: 'success',
            message: 'Product rejected'
        });

    } catch (err) {
        if (connection) connection.release();
        next(err);
    }
});

// Route: Delete Core product image
app.delete('/api/v1/core-products/:productId/images/:imageId', async (req, res, next) => {
    let connection;
    try {
        connection = await db.getConnection();

        // Get image info
        const [images] = await connection.query(
            'SELECT * FROM product_images WHERE id = ?',
            [req.params.imageId]
        );

        if (images.length === 0) {
            connection.release();
            return next(new AppError('Image not found', 404));
        }

        const image = images[0];

        // Delete from database
        await connection.query('DELETE FROM product_images WHERE id = ?', [req.params.imageId]);

        connection.release();

        res.status(200).json({
            status: 'success',
            message: 'Image deleted'
        });

    } catch (err) {
        if (connection) connection.release();
        next(err);
    }
});

// Route: Deactivate Core product (remove from store)
app.patch('/api/v1/core-products/:productId/deactivate', async (req, res, next) => {
    let connection;
    try {
        const productId = req.params.productId;
        connection = await db.getConnection();
        
        // Get product details
        const [products] = await connection.query('SELECT * FROM products WHERE id = ?', [productId]);
        if (products.length === 0) {
            connection.release();
            return next(new AppError('Product not found', 404));
        }

        const product = products[0];

        // Update product status to deactivate
        await connection.query(
            'UPDATE products SET is_active = 0, updated_at = NOW() WHERE id = ?',
            [productId]
        );

        connection.release();

        // Send email notification
        try {
            const mailOptions = {
                from: `"${STORE_DETAILS.name}" <${EMAIL_SENDERS.salest}>`,
                to: EMAIL_SENDERS.sales,
                subject: `Product Deactivated - ${product.product_name}`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 24px; text-align: center; border-radius: 8px 8px 0 0;">
                            <h1 style="margin: 0; font-size: 24px;">⊘ Product Deactivated</h1>
                        </div>
                        
                        <div style="padding: 24px; background: white; border: 1px solid #eee;">
                            <h2 style="margin: 0 0 16px 0; color: #333;">Product Removed from Store</h2>
                            <p style="color: #666; margin: 0 0 12px 0;"><strong>Product Name:</strong> ${product.product_name}</p>
                            <p style="color: #666; margin: 0 0 12px 0;"><strong>Stock Code:</strong> ${product.product_number}</p>
                            <p style="color: #666; margin: 0 0 12px 0;"><strong>Status:</strong> <span style="color: #f59e0b; font-weight: bold;">DEACTIVATED</span></p>
                            
                            <p style="margin: 20px 0 0 0; color: #666; font-size: 14px;">The product has been deactivated and is no longer visible to customers.</p>
                        </div>
                    </div>
                `
            };

            await transporter.sendMail(mailOptions);
            console.log(`[EMAIL] Product deactivation notification sent for ${product.product_name}`);
        } catch (emailErr) {
            console.error('[EMAIL] Error sending deactivation notification:', emailErr);
            // Don't fail the API if email fails
        }

        res.status(200).json({
            status: 'success',
            message: 'Product deactivated',
            data: { productId }
        });

    } catch (err) {
        if (connection) connection.release();
        next(err);
    }
});

// Route: Activate Core product (add back to store)
app.patch('/api/v1/core-products/:productId/activate', async (req, res, next) => {
    let connection;
    try {
        const productId = req.params.productId;
        connection = await db.getConnection();
        
        // Get product details
        const [products] = await connection.query('SELECT * FROM products WHERE id = ?', [productId]);
        if (products.length === 0) {
            connection.release();
            return next(new AppError('Product not found', 404));
        }

        const product = products[0];

        // Update product to activate
        await connection.query(
            'UPDATE products SET is_active = 1, updated_at = NOW() WHERE id = ?',
            [productId]
        );

        connection.release();

        // Send email notification
        try {
            const mailOptions = {
                from: `"${STORE_DETAILS.name}" <${EMAIL_SENDERS.sales}>`,
                to: EMAIL_SENDERS.sales,
                subject: `Product Activated - ${product.product_name}`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 24px; text-align: center; border-radius: 8px 8px 0 0;">
                            <h1 style="margin: 0; font-size: 24px;">✓ Product Activated</h1>
                        </div>
                        
                        <div style="padding: 24px; background: white; border: 1px solid #eee;">
                            <h2 style="margin: 0 0 16px 0; color: #333;">Product Back in Store</h2>
                            <p style="color: #666; margin: 0 0 12px 0;"><strong>Product Name:</strong> ${product.product_name}</p>
                            <p style="color: #666; margin: 0 0 12px 0;"><strong>Stock Code:</strong> ${product.product_number}</p>
                            <p style="color: #666; margin: 0 0 12px 0;"><strong>Status:</strong> <span style="color: #10b981; font-weight: bold;">ACTIVE</span></p>
                            
                            <p style="margin: 20px 0 0 0; color: #666; font-size: 14px;">The product has been reactivated and is now visible to customers.</p>
                        </div>
                    </div>
                `
            };

            await transporter.sendMail(mailOptions);
            console.log(`[EMAIL] Product activation notification sent for ${product.product_name}`);
        } catch (emailErr) {
            console.error('[EMAIL] Error sending activation notification:', emailErr);
            // Don't fail the API if email fails
        }

        res.status(200).json({
            status: 'success',
            message: 'Product activated',
            data: { productId }
        });

    } catch (err) {
        if (connection) connection.release();
        next(err);
    }
});

// ============================================================================//
//               creating the function to add products to database             //
//=============================================================================//
// ============================================================================//
//             creating the function to get products from database             //
//=============================================================================//
function normalizeStoreProductText(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function isStoreLaptopProduct(product) {
    const name = normalizeStoreProductText(product.product_name);
    const text = normalizeStoreProductText([
        product.product_name,
        product.description,
        product.brand,
        product.product_number
    ].filter(Boolean).join(' '));
    const brand = normalizeStoreProductText(product.brand);

    const accessoryTerms = /\b(powerbank|power bank|backpack|bag|case|sleeve|headset|webcam|hub|screw|rolling|notepac|clamshell|stand|dock|lock|mah)\b/;
    if (accessoryTerms.test(name)) return false;

    const laptopBrand = /\b(dell|hp|lenovo|acer|microsoft|apple|macbook|mac)\b/.test(`${brand} ${name}`);
    const laptopFamily = /\b(laptop|notebook|macbook|mba|mbp|mac\s?book|2in1|chromebook|v15|v14|latitude|xps|inspiron|thinkpad|ideapad|probook|elitebook|expertbook|zenbook|vivobook|alienware|swift|aspire|surface laptop|surface pro|thinkbook|exo\d*|tmp\d*|tmx\d*|travelmate|dell pro 13|dell pro 14|dell pro 15|dell pro 16|dell 14|dell 15|dell 16|e14|e16|t14|t14s|x13|tb\s?(14|16))\b/.test(`${brand} ${name}`);
    const hasProcessor = /\b(i[3579]|core|intel|ryzen|amd|celeron|pentium|snapdragon|ultra\s?[3579]|u[3579][-\s]?\d*|m[1-5]|n100|n200)\b/.test(text) || /\b(mba|mbp|macbook)\b/.test(name);
    const hasRam = /\b(4|8|12|16|18|24|32|36|48|64|96|128)\s?gb\b.*\b(ram|memory|ddr|lpddr|unified)\b|\b(ram|memory|ddr|lpddr|unified)\b.*\b(4|8|12|16|18|24|32|36|48|64|96|128)\s?gb\b|\b(4|8|12|16|18|24|32|36|48|64|96|128)\s?gb\b/.test(text);
    const hasStorage = /\b(128|256|512|1024|2048)\s?gb\b.*\b(ssd|nvme|storage|solid|drive)\b|\b(1|2|4|8)\s?t(b)?\b|\b(ssd|nvme|storage|solid|drive)\b.*\b(128|256|512|1024|2048)\s?gb\b/.test(text) ||
        (laptopFamily && /\b(128|256|512|1024|2048)\s?gb\b/.test(text));
    const hasPortableSignals = /\b(13|14|15|16|17)(\.\d)?\s?(in|inch)\b/.test(text) || /\b(wqxga|wuxga|fhd|oled|ips|touchscreen|comfortview)\b/.test(text);
    const hasMobileBuild = /\b(battery|whr|wi\s?fi|wifi|camera|backlit|fingerprint|facial recognition|control vault|lte|esim)\b/.test(text);

    if (/\balienware\s?16\b/.test(name) && hasProcessor && hasRam && hasPortableSignals) {
        return true;
    }

    if (/\bdell intel core ultra\b/.test(name) && hasProcessor && hasRam && hasStorage && /\b(lpddr|fingerprint|facial recognition|control vault)\b/.test(text)) {
        return true;
    }

    return laptopBrand && hasProcessor && hasRam && hasStorage && (laptopFamily || (hasPortableSignals && hasMobileBuild));
}

function isStoreAppleLaptopProduct(product) {
    const text = normalizeStoreProductText([
        product.product_name,
        product.description,
        product.brand,
        product.product_number
    ].filter(Boolean).join(' '));

    return /\b(apple|macbook|mac\s?book|mba|mbp|mac)\b/.test(text) && isStoreLaptopProduct(product);
}

function getStoreProductCategory(product) {
    const text = normalizeStoreProductText([
        product.product_name,
        product.description,
        product.brand,
        product.product_number
    ].filter(Boolean).join(' '));

    const hasComputerProcessor = /\b(i[3579]|core|intel|ryzen|amd|celeron|pentium|snapdragon|ultra\s?[3579]|u[3579][-\s]?\d*|n100|n200)\b/.test(text);
    const hasComputerRam = /\b(4|8|12|16|18|24|32|36|48|64|96|128)\s?gb\b.*\b(ram|memory|ddr|lpddr|unified)\b|\b(ram|memory|ddr|lpddr|unified)\b.*\b(4|8|12|16|18|24|32|36|48|64|96|128)\s?gb\b|\b(4|8|12|16|18|24|32|36|48|64|96|128)\s?gb\b/.test(text);
    const hasComputerStorage = /\b(128|256|512|1024|2048)\s?gb\b.*\b(ssd|nvme|storage|solid|drive|pcie)\b|\b(1|2|4|8)\s?t(b)?\b|\b(ssd|nvme|storage|solid|drive|pcie)\b.*\b(128|256|512|1024|2048)\s?gb\b/.test(text);
    const hasComputerSystemSignal = /\b(windows\s?11|windows\s?10|integrated graphics|graphics|display|fhd|wuxga|wqxga|battery|whr)\b/.test(text);
    const looksLikeFullComputer = hasComputerProcessor && hasComputerRam && hasComputerStorage && hasComputerSystemSignal;

    if (/\b(racing|trueforce|driving force|racing wheel|wheel for xbox|wheel for ps|shifter|sim racing)\b/.test(text)) return 'hidden-unwanted';
    if (/\b(speaker|speakers|stereo|bluetooth speaker|soundbar|subwoofer)\b/.test(text)) return 'hidden-unwanted';
    if (/\b(usb receiver|wireless receiver|mini receiver|presentation remote|presenter|laser pointer|red laser|r400)\b/.test(text)) return 'hidden-unwanted';
    if (/\b(windows server|server cal|device cal|client access license|sever standard|server standard)\b/.test(text)) return 'hidden-unwanted';
    if (/\b(lock|defcon|kensington|nano combination|combination lock|notebook lock|wedge lock|key lock|cable lock|keyed lock|hypershield|3 in 1 combination|3-in-1 combination|legion nano)\b/.test(text)) return 'hidden-unwanted';
    if (/\b(ac adapter|adapter slim tip|usb c to ethernet|usb c-to ethernet|ethernet adapter|thinkpad usb|hdmi to vga|hdhmi to vga|video adapter|displayport socket|monitor cable)\b/.test(text) && !isStoreLaptopProduct(product)) return 'hidden-unwanted';
    if (/\b(eaton hotswap|hotswap mbp|mbp iec|hot swap mbp)\b/.test(text)) return 'hidden-unwanted';
    if (/\b(thinkpad\s+\d+\s*gb\s+ddr|sodimm|memory module|ram module)\b/.test(text) && !isStoreLaptopProduct(product)) return 'hidden-unwanted';
    if (/\b(targus avila|heritageluxe|corporate trav|drifter backpack|campus 15|campus 15in|campus 15 in|prelude pro recycle|ecosmart multifit sleeve|11 12 ecosmart|notepac|notebook table clamp)\b/.test(text)) return 'hidden-unwanted';
    if (/\b(backpack|back pack|laptop bag|notebook bag|topload|sleeve|carry case|messenger|briefcase|tote|avila|heritageluxe|corporate trav|drifter|campus|prelude pro recycle|multifit|ecosmart)\b/.test(text)) return 'laptop-bags';
    if (/\btargus\b/.test(text) && !/\b(mouse|keyboard)\b/.test(text)) return 'hidden-unwanted';
    if (/\b(portable stand|laptop stand|ergonomic laptop stand|ergostand|hyperspace ergonomic|steel laptop stand|multiangle|integrated dock|docking station|dock|hub|4 port|7 port|multifunction hub|chill mat|privacy screen|smart case|protect case|slim smart case|\bcase\b|stylus|active stylus|embedded clip|3 leaf clover|leaf clover|clover)\b/.test(text) && !isStoreLaptopProduct(product)) return 'hidden-unwanted';
    if (/\bstand(s)?\b/.test(text) && !/\bmonitor\b/.test(text) && !isStoreLaptopProduct(product)) return 'hidden-unwanted';
    if (/\b(ugreen|snug|gan|home charger|pd charger|powerbank|power bank|battery pack|portable charger|wireless mouse pad charger|mouse pad charger|wireless charging pad)\b/.test(text)) return 'hidden-unwanted';
    if (/\b(samsung|galaxy)\b/.test(text) && /\b(5g|a36|a37|a56|s25|ultra|phone|android|amoled|rear cam|front cam)\b/.test(text)) return 'hidden-unwanted';
    if (/\b(teams open office|uc platform|audio receiver|bluetooth audio receiver|hp series 3 pro|series 3 pro)\b/.test(text)) return 'hidden-unwanted';
    if (/\b(ups|smart ups|back ups|pdu|power distribution|surge|apc)\b/.test(text)) return 'hidden-power-ups';
    if (/\b(printer|printhead|laserjet|toner|ink|cartridge|fuser|imaging drum|maintenance kit|oki|lexmark|\bblk\b|col bundle|305xl|652)\b/.test(text)) return 'hidden-printers-toner';
    if (/\b(all in one|all-in-one|\baio\b|tower plus|pro tower|pro tower essential|qct1250|qvt1260)\b/.test(text)) return 'hidden-unwanted';
    if (/\b(dell pro micro|dell pro slim|pro micro|pro slim|micro qcm|slim qcs|qcs1250|micro desktop|micro form factor|optiplex|thinkcentre|prodesk|elitedesk|pro slim essential|mini pc)\b/.test(text)) return 'desktops';
    if (/\b(workstation|zbook|z workstation|precision)\b/.test(text)) return 'workstations';
    if (isStoreLaptopProduct(product)) return 'laptops';
    if (looksLikeFullComputer) return 'desktops';
    if (/\b(keyboard and mouse|keyboard mouse|desktop combo|wired desktop combo|wireless combo|combo keyboard|keyboard)\b/.test(text)) return 'keyboards';
    if (/\b(mouse|mice)\b/.test(text)) return 'mice';
    if (/\b(keyboard|combo keyboard|wireless combo)\b/.test(text)) return 'keyboards';
    if (/\b(monitor|display|fhd|qhd|uhd|4k)\b/.test(text) && !/\b(laptop|notebook|macbook)\b/.test(text) && !isStoreLaptopProduct(product)) return 'monitors';
    return 'hidden-unwanted';
}

function shouldHideStoreApiProduct(product) {
    const text = normalizeStoreProductText([
        product.product_name,
        product.description,
        product.brand,
        product.product_number
    ].filter(Boolean).join(' '));
    const category = getStoreProductCategory(product);

    return category.startsWith('hidden-') ||
        /\bscrews?\b/.test(text) ||
        text.includes('legion branded combination notebook') ||
        text.includes('legion notebook combination nano');
}

function getStoreDedupeKey(product) {
    const name = normalizeStoreProductText(product.product_name || product.description);
    const brand = normalizeStoreProductText(product.brand);
    const category = getStoreProductCategory(product);
    return `${category}|${brand}|${name}`;
}

function dedupeStoreProducts(products) {
    const groups = new Map();

    products.forEach(product => {
        if ((Number(product.quantity) || 0) <= 0) return;
        if ((!product.image_url || String(product.image_url).trim() === '') && !isStoreAppleLaptopProduct(product)) return;
        if (shouldHideStoreApiProduct(product)) return;

        const key = getStoreDedupeKey(product);
        const category = getStoreProductCategory(product);
        const existing = groups.get(key);
        const quantity = Number(product.quantity) || 0;
        const price = Number(product.price) || 0;

        if (!existing) {
            groups.set(key, {
                ...product,
                quantity,
                price,
                store_category: category,
                source_count: 1,
                duplicate_ids: [product.id]
            });
            return;
        }

        existing.quantity += quantity;
        existing.source_count += 1;
        existing.duplicate_ids.push(product.id);

        const existingPrice = Number(existing.price) || 0;
        const shouldUseCandidate = (price > 0 && (existingPrice <= 0 || price < existingPrice)) ||
            (!existing.image_url && product.image_url);

        if (shouldUseCandidate) {
            existing.id = product.id;
            existing.product_number = product.product_number || existing.product_number;
            existing.product_name = product.product_name || existing.product_name;
            existing.description = product.description || existing.description;
            existing.price = price || existing.price;
            existing.warehouse_price = product.warehouse_price || existing.warehouse_price;
            existing.brand = product.brand || existing.brand;
            existing.image_url = product.image_url || existing.image_url;
            existing.updated_at = product.updated_at || existing.updated_at;
        }
    });

    return Array.from(groups.values());
}

app.get('/api/v1/products', async (req, res, next) => { 
    try {
        const connection = await db.getConnection();
        try {
            // Get products with images - using GROUP_CONCAT to handle only_full_group_by
            const [products] = await connection.query(`
                SELECT 
                    p.id,
                    p.product_number,
                    p.product_name,
                    p.description,
                    p.price,
                    p.warehouse_price,
                    p.quantity,
                    p.brand,
                    'Electronics' as product_type,
                    p.status,
                    p.is_active,
                    p.created_at,
                    p.updated_at,
                    (SELECT image_url FROM product_images 
                     WHERE product_id = p.id 
                     ORDER BY is_primary DESC, id ASC 
                     LIMIT 1) as image_url
                FROM products p 
                WHERE (p.status IS NULL OR p.status = 'approved') AND (p.is_active = 1 OR p.is_active IS NULL)
                ORDER BY p.updated_at DESC
            `);

            const storeProducts = dedupeStoreProducts(products);

            console.log(`[Store API] Returning ${storeProducts.length} grouped products from ${products.length} rows`);
            storeProducts.slice(0, 3).forEach(p => {
                console.log(`  - ID ${p.id}: ${p.product_name?.substring(0, 25)} | Brand: ${p.brand} | Type: ${p.product_type || 'N/A'} | status: ${p.status || 'NULL'}`);
            });

            res.status(200).json({
                status: 'success',
                results: storeProducts.length,
                data: { products: storeProducts }
            });
        } finally {
            connection.release();
        }
    } catch (err) {
        console.error("[Store API] ERROR:", err.message);
        next(err);
    }
});

//=============================================================================//
//                         SMART PRODUCT RECOMMENDATIONS                        //
//=============================================================================//
const recommendationCache = new Map();
const RECOMMENDATION_CACHE_TTL = 5 * 60 * 1000;

function normalizeRecommendationCategory(input) {
    const text = String(input || '').toLowerCase();

    if (/(duo|mfa|multi.?factor|2fa|two.?factor|authentication|security license)/i.test(text)) return 'duo_license';
    if (/(microsoft|office|365|windows|teams|sharepoint|outlook|license|licence|software)/i.test(text)) return 'microsoft_license';
    if (/(laptop bag|notebook bag|backpack|sleeve|carry case|bag)/i.test(text)) return 'laptop_bag';
    if (/(keyboard|keys|keychron|logitech k|wireless keyboard)/i.test(text)) return 'keyboard';
    if (/(mouse|mice|mx master|wireless mouse|mouse set|combo)/i.test(text)) return 'mouse';
    if (/(laptop|notebook|macbook|thinkpad|ideapad|latitude|xps|elitebook|probook|surface|swift|aspire|legion|vivobook)/i.test(text)) return 'laptop';
    if (/(monitor|display|screen|lcd|led|uhd|fhd|qhd)/i.test(text)) return 'monitor';
    if (/(watch|smartwatch|smart watch|wearable)/i.test(text)) return 'watch';
    if (/(charger|adapter|power supply|usb.?c|type.?c|dock|hub)/i.test(text)) return 'charger';
    if (/(warranty|support|care pack|onsite|service plan)/i.test(text)) return 'support';
    if (/(stand|riser|wrist rest|accessor|cable|headset|speaker|webcam)/i.test(text)) return 'accessory';

    return 'hardware';
}

function getRecommendationPriceTier(price) {
    const value = Number(price) || 0;
    if (value >= 35000) return 'enterprise';
    if (value >= 18000) return 'premium';
    if (value >= 7000) return 'mid';
    return 'entry';
}

function inferRecommendationProduct(product) {
    const text = [
        product?.product_name,
        product?.description,
        product?.brand,
        product?.product_type
    ].filter(Boolean).join(' ');

    return {
        category: normalizeRecommendationCategory(text),
        price: Number(product?.price) || 0,
        tier: getRecommendationPriceTier(product?.price)
    };
}

const relatedCategoryWeights = {
    laptop: {
        laptop_bag: 95,
        microsoft_license: 92,
        duo_license: 90,
        mouse: 86,
        keyboard: 82,
        monitor: 80,
        support: 78,
        charger: 70,
        accessory: 58
    },
    keyboard: {
        mouse: 92,
        monitor: 75,
        accessory: 72,
        laptop: 58,
        support: 30
    },
    mouse: {
        keyboard: 88,
        laptop_bag: 68,
        monitor: 64,
        accessory: 60,
        laptop: 45
    },
    microsoft_license: {
        duo_license: 98,
        support: 84,
        laptop: 72,
        accessory: 48,
        keyboard: 34,
        mouse: 34
    },
    duo_license: {
        microsoft_license: 90,
        support: 86,
        laptop: 65,
        monitor: 38
    },
    laptop_bag: {
        laptop: 92,
        mouse: 74,
        keyboard: 70,
        charger: 68,
        accessory: 64,
        microsoft_license: 54,
        duo_license: 50
    },
    monitor: {
        keyboard: 76,
        mouse: 74,
        laptop: 72,
        accessory: 56,
        support: 36
    },
    watch: {
        charger: 64,
        accessory: 58,
        laptop: 38
    },
    charger: {
        laptop: 76,
        laptop_bag: 64,
        accessory: 56
    },
    accessory: {
        laptop: 58,
        keyboard: 52,
        mouse: 52,
        monitor: 44
    },
    hardware: {
        laptop: 42,
        accessory: 40,
        support: 32
    }
};

function getRecommendationReason(sourceCategories, targetCategory, context) {
    const sourceSet = new Set(sourceCategories);

    if (sourceSet.has('laptop') && targetCategory === 'microsoft_license') {
        return 'Recommended because it adds Office productivity to your laptop setup.';
    }
    if (sourceSet.has('laptop') && targetCategory === 'duo_license') {
        return 'Best add-on for securing the device and user sign-ins.';
    }
    if (sourceSet.has('laptop') && targetCategory === 'laptop_bag') {
        return 'Recommended because it protects your laptop on the move.';
    }
    if (sourceSet.has('laptop') && targetCategory === 'monitor') {
        return 'Frequently bought with laptops for a better desk setup.';
    }
    if (sourceSet.has('laptop') && ['mouse', 'keyboard'].includes(targetCategory)) {
        return 'Recommended because it completes your laptop setup.';
    }
    if (sourceSet.has('keyboard') && targetCategory === 'mouse') {
        return 'Frequently bought with keyboards for a cleaner workstation.';
    }
    if (sourceSet.has('keyboard') && targetCategory === 'monitor') {
        return 'A useful add-on for a more productive desk setup.';
    }
    if (sourceSet.has('microsoft_license') && targetCategory === 'duo_license') {
        return 'Best add-on for security and productivity.';
    }
    if (sourceSet.has('laptop_bag') && targetCategory === 'laptop') {
        return 'A strong match if you are building a portable work kit.';
    }
    if (targetCategory === 'support') {
        return 'Useful protection for business-critical hardware.';
    }
    if (context === 'checkout') {
        return 'Last-minute add-on that fits the items in your cart.';
    }
    if (context === 'cart') {
        return 'Bundle-ready suggestion based on your cart.';
    }

    return 'Smart add-on based on your selected product.';
}

function scoreRecommendationCandidate(candidate, sourceProfiles, cartCategories, recentCategories, context) {
    const candidateProfile = inferRecommendationProduct(candidate);
    const candidateCategory = candidateProfile.category;
    const sourceCategories = sourceProfiles.map(item => item.category);
    let score = 0;

    sourceCategories.forEach(sourceCategory => {
        score += relatedCategoryWeights[sourceCategory]?.[candidateCategory] || 0;
    });

    cartCategories.forEach(category => {
        score += (relatedCategoryWeights[category]?.[candidateCategory] || 0) * 0.65;
    });

    recentCategories.forEach(category => {
        score += (relatedCategoryWeights[category]?.[candidateCategory] || 0) * 0.28;
    });

    if (context === 'checkout') score += ['duo_license', 'microsoft_license', 'mouse', 'laptop_bag', 'support'].includes(candidateCategory) ? 18 : 0;
    if (context === 'cart') score += ['duo_license', 'microsoft_license', 'monitor', 'laptop_bag'].includes(candidateCategory) ? 15 : 0;

    const maxSourcePrice = Math.max(...sourceProfiles.map(item => item.price || 0), 0);
    const candidatePrice = Number(candidate.price) || 0;

    if (maxSourcePrice > 0 && candidatePrice > 0) {
        const ratio = candidatePrice / maxSourcePrice;
        if (ratio >= 0.02 && ratio <= 0.35) score += 18;
        else if (ratio > 0.35 && ratio <= 0.75) score += 10;
        else if (ratio <= 0.02) score += 5;
        else score -= 8;
    }

    const stock = Number(candidate.quantity) || 0;
    score += Math.min(stock, 50) * 0.35;

    const price = Number(candidate.price) || 0;
    const warehousePrice = Number(candidate.warehouse_price) || 0;
    if (price > 0 && warehousePrice > 0 && price > warehousePrice) {
        score += Math.min(((price - warehousePrice) / price) * 30, 12);
    }

    const text = `${candidate.product_name || ''} ${candidate.description || ''}`.toLowerCase();
    if (sourceCategories.includes('laptop') && /(office|365|microsoft|duo|mfa|bag|mouse|keyboard|monitor|warranty|support)/.test(text)) score += 16;
    if (sourceCategories.includes('microsoft_license') && /(duo|mfa|security|support|laptop)/.test(text)) score += 18;
    if (sourceCategories.includes('keyboard') && /(mouse|wrist|stand|monitor)/.test(text)) score += 15;

    if (candidateProfile.tier === 'entry' && sourceProfiles.some(item => item.tier === 'enterprise')) score -= 4;
    if (candidateProfile.tier === 'enterprise' && sourceProfiles.some(item => item.tier === 'entry')) score -= 10;

    return {
        score,
        category: candidateCategory
    };
}

app.post('/api/v1/recommendations', async (req, res, next) => {
    try {
            const {
                productId,
                cartItems = [],
                category,
                price,
                userId,
                sessionId,
                recentlyViewed = [],
                context = 'product',
                limit = 5,
                randomSeed,
                noCache = false
            } = req.body || {};

        const safeLimit = Math.max(1, Math.min(Number(limit) || 5, 8));
        const cartProductIds = new Set(
            (Array.isArray(cartItems) ? cartItems : [])
                .map(item => Number(item.id || item.productID || item.product_id))
                .filter(Boolean)
        );
        if (productId) cartProductIds.add(Number(productId));

        const cacheKey = JSON.stringify({
            productId: productId || null,
            category: category || null,
            price: price || null,
            cartIds: [...cartProductIds].sort((a, b) => a - b),
            recent: (Array.isArray(recentlyViewed) ? recentlyViewed : []).slice(-8).map(item => item.id || item.productId || item.category).join('|'),
            context,
            limit: safeLimit,
            randomSeed: randomSeed || null,
            identity: userId || sessionId || 'guest'
        });

        const cached = recommendationCache.get(cacheKey);
        if (!noCache && cached && Date.now() - cached.createdAt < RECOMMENDATION_CACHE_TTL) {
            return res.status(200).json(cached.payload);
        }

        const connection = await db.getConnection();
        try {
            let currentProduct = null;
            if (productId) {
                const [rows] = await connection.query(
                    `SELECT p.*, (SELECT image_url FROM product_images WHERE product_id = p.id ORDER BY is_primary DESC, id ASC LIMIT 1) as image_url
                     FROM products p
                     WHERE p.id = ? AND (p.status IS NULL OR p.status = 'approved') AND (p.is_active = 1 OR p.is_active IS NULL)
                     LIMIT 1`,
                    [productId]
                );
                currentProduct = rows[0] || null;
            }

            const sourceProfiles = [];
            if (currentProduct) {
                sourceProfiles.push(inferRecommendationProduct(currentProduct));
            } else if (category || price) {
                sourceProfiles.push({
                    category: normalizeRecommendationCategory(category),
                    price: Number(price) || 0,
                    tier: getRecommendationPriceTier(price)
                });
            }

            (Array.isArray(cartItems) ? cartItems : []).forEach(item => {
                sourceProfiles.push(inferRecommendationProduct({
                    product_name: item.product_name || item.name,
                    description: item.description,
                    brand: item.brand,
                    product_type: item.category || item.product_type || item.type,
                    price: item.price
                }));
            });

            if (sourceProfiles.length === 0) {
                sourceProfiles.push({ category: 'hardware', price: 0, tier: 'entry' });
            }

            const cartCategories = (Array.isArray(cartItems) ? cartItems : [])
                .map(item => inferRecommendationProduct({
                    product_name: item.product_name || item.name,
                    description: item.description,
                    brand: item.brand,
                    product_type: item.category || item.product_type || item.type,
                    price: item.price
                }).category);

            const recentCategories = (Array.isArray(recentlyViewed) ? recentlyViewed : [])
                .slice(-8)
                .map(item => normalizeRecommendationCategory(item.category || `${item.product_name || item.name || ''} ${item.description || ''}`));

            const [candidates] = await connection.query(`
                SELECT
                    p.id,
                    p.product_number,
                    p.product_name,
                    p.description,
                    p.price,
                    p.warehouse_price,
                    p.quantity,
                    p.brand,
                    (SELECT image_url FROM product_images
                     WHERE product_id = p.id
                     ORDER BY is_primary DESC, id ASC
                     LIMIT 1) as image_url
                FROM products p
                WHERE (p.status IS NULL OR p.status = 'approved')
                  AND (p.is_active = 1 OR p.is_active IS NULL)
                  AND COALESCE(p.quantity, 0) > 0
                ORDER BY p.updated_at DESC
                LIMIT 500
            `);

            const sourceCategories = sourceProfiles.map(item => item.category);
            const recommendationSeed = String(randomSeed || `${Date.now()}-${Math.random()}`);
            const randomRank = (candidate) => {
                const raw = `${recommendationSeed}:${candidate.id}:${candidate.product_name || ''}`;
                let hash = 0;
                for (let index = 0; index < raw.length; index += 1) {
                    hash = ((hash << 5) - hash) + raw.charCodeAt(index);
                    hash |= 0;
                }
                return Math.abs(hash % 1000) / 1000;
            };

            const ranked = candidates
                .filter(candidate => !cartProductIds.has(Number(candidate.id)))
                .filter(candidate => !shouldHideStoreApiProduct(candidate))
                .filter(candidate => getStoreProductCategory(candidate) !== 'hidden-unwanted')
                .filter(candidate => candidate.image_url)
                .map(candidate => {
                    const rankedCandidate = scoreRecommendationCandidate(candidate, sourceProfiles, cartCategories, recentCategories, context);
                    return {
                        ...candidate,
                        recommendation_category: rankedCandidate.category,
                        recommendation_score: rankedCandidate.score + randomRank(candidate),
                        recommendation_random: randomRank(candidate),
                        reason: getRecommendationReason(sourceCategories, rankedCandidate.category, context)
                    };
                })
                .filter(candidate => candidate.recommendation_score > 0)
                .sort((a, b) => b.recommendation_score - a.recommendation_score)
                .slice(0, Math.max(safeLimit * 4, 18))
                .sort((a, b) => b.recommendation_random - a.recommendation_random)
                .slice(0, safeLimit)
                .map(candidate => ({
                    id: candidate.id,
                    product_name: candidate.product_name,
                    description: candidate.description,
                    price: Number(candidate.price),
                    quantity: Number(candidate.quantity),
                    brand: candidate.brand,
                    image_url: candidate.image_url,
                    category: candidate.recommendation_category,
                    reason: candidate.reason,
                    bundle_ready: context === 'cart' || context === 'checkout'
                }));

            const payload = {
                status: 'success',
                results: ranked.length,
                data: { recommendations: ranked }
            };

            if (!noCache) {
                recommendationCache.set(cacheKey, { createdAt: Date.now(), payload });
                if (recommendationCache.size > 100) {
                    const firstKey = recommendationCache.keys().next().value;
                    recommendationCache.delete(firstKey);
                }
            }

            res.status(200).json(payload);
        } finally {
            connection.release();
        }
    } catch (err) {
        console.error('[Recommendations API] Error:', err.message);
        next(err);
    }
});

//=============================================================================//
//                      IMAGE UPLOAD FOR EXISTING PRODUCTS                     //
//=============================================================================//
app.post('/api/v1/products/:productId/images', upload.array('photos', 10), async (req, res, next) => {
    try {
        const productId = req.params.productId;
        const files = req.files;

        if (!files || files.length === 0) {
            return next(new AppError('No files uploaded', 400));
        }

        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                await connection.query(
                    `INSERT INTO product_images (product_id, image_url, is_primary, sort_order) VALUES (?, ?, ?, ?)`,
                    [productId, file.filename, i === 0, i]
                );
            }

            await connection.commit();
            res.status(201).json({
                status: 'success',
                message: 'Product images added successfully',
                imagesUploaded: files.length
            });
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
    } catch (err) {
        next(err);
    }
});

app.get('/api/v1/products/:id', async (req, res, next) => {
    try {
        const connection = await db.getConnection();
        try {
            // Only fetch products that are visible to customers:
            // 1. Manual products (status IS NULL) AND active
            // 2. Approved Core API products (status = 'approved') AND active
            const [products] = await connection.query(
                'SELECT * FROM Products WHERE id = ? AND (status IS NULL OR status = ?) AND (is_active = 1 OR is_active IS NULL)', 
                [req.params.id, 'approved']
            );
            
            if (products.length === 0) {
                return next(new AppError('No product found with that ID', 404));
            }

            if (Number(products[0].quantity || 0) <= 0 || shouldHideStoreApiProduct(products[0])) {
                return next(new AppError('This product is not available in the procurement store', 404));
            }

            const [images] = await connection.query('SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order', [req.params.id]);

            res.status(200).json({
                status: 'success',
                data: {
                    product: products[0],
                    images
                }
            });
        } finally {
            connection.release();
        }
    } catch (err) {
        next(err);
    }
});

// ⚡ NEW: GET COMPREHENSIVE PRODUCT DETAILS FROM AXIZ
app.get('/api/v1/products/:id/axiz-details', async (req, res, next) => {
    try {
        const connection = await db.getConnection();
        const [products] = await connection.query('SELECT * FROM Products WHERE id = ?', [req.params.id]);
        connection.release();

        if (products.length === 0) {
            return next(new AppError('No product found with that ID', 404));
        }

        const product = products[0];
        const axizDetails = await getAxizProductDetails(product.product_number, product.brand);

        if (!axizDetails) {
            return res.status(200).json({
                status: 'success',
                source: 'local',
                data: { product }
            });
        }

        res.status(200).json({
            status: 'success',
            source: 'axiz',
            data: axizDetails
        });

    } catch (err) {
        next(err);
    }
});

// ==========================================================================================================//
//                                              cart handling                                                //
// ==========================================================================================================//
async function resolveCartProductID(connection, userID, identifier) {
    const parsedIdentifier = parseInt(identifier);
    if (!userID || !parsedIdentifier || isNaN(parsedIdentifier)) return null;

    const [byProductID] = await connection.query(
        'SELECT productID FROM Cart WHERE userID = ? AND productID = ? LIMIT 1',
        [userID, parsedIdentifier]
    );
    if (byProductID.length) return byProductID[0].productID;

    const [byCartRowID] = await connection.query(
        'SELECT productID FROM Cart WHERE userID = ? AND id = ? LIMIT 1',
        [userID, parsedIdentifier]
    );
    return byCartRowID.length ? byCartRowID[0].productID : null;
}

// --- SYNC LOCAL STORAGE TO DATABASE ---
app.post('/api/v1/cart/sync', async (req, res, next) => {
    const { userID, items } = req.body;
    let connection;
    try {
        if (!userID || !Array.isArray(items) || !items.length) {
            return res.status(400).json({
                status: 'error',
                message: 'userID and at least one cart item are required'
            });
        }

        console.log('[Cart API] Sync requested for userID:', userID);
        connection = await db.getConnection();
        await connection.beginTransaction();

        let syncCount = 0;
        for (const item of items) {
            const itemType = item.type || item.cart_type;
            if (isDigitalLicenseType(itemType)) {
                const config = getDigitalLicenseConfig(item);
                if (!item.id || !Object.keys(config).length) {
                    throw new AppError('Digital license cart configuration is incomplete', 400);
                }

                await connection.query(
                    `INSERT INTO duo_cart_items (userID, cart_product_id, cart_type, duo_config_json)
                     VALUES (?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE cart_type = VALUES(cart_type), duo_config_json = VALUES(duo_config_json)`,
                    [userID, String(item.id).slice(0, 120), itemType, JSON.stringify(config)]
                );
                console.log(`[Cart API] Digital license synced: ${item.id}`);
                syncCount++;
                continue;
            }

            const productID = parseInt(item.product_id || item.productID || item.id);
            const quantity = Math.max(1, parseInt(item.quantity) || 1);
            if (isNaN(productID)) {
                throw new AppError(`Invalid product ID: ${item.product_id || item.productID || item.id}`, 400);
            }

            const [productCheck] = await connection.query(
                'SELECT id FROM products WHERE id = ? LIMIT 1',
                [productID]
            );
            if (!productCheck?.length) {
                throw new AppError(`Product not found: ${productID}`, 404);
            }

            await connection.query(
                'INSERT INTO Cart (userID, productID, quantity) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)',
                [userID, productID, quantity]
            );
            console.log(`[Cart API] Product synced: ${productID}`);
            syncCount++;
        }

        await connection.commit();
        res.status(200).json({ status: 'success', synced: syncCount });
    } catch (err) {
        console.error('[Cart API] Sync error:', err);
        if (connection) {
            try { await connection.rollback(); } catch (rollbackError) {
                console.error('[Cart API] Sync rollback error:', rollbackError.message);
            }
        }
        next(err);
    } finally {
        if (connection) connection.release();
    }
});

// Route: Get the latest Core inventory sync and usable product counts.
app.get('/api/v1/core-status', async (req, res, next) => {
    let connection;
    try {
        connection = await db.getConnection();
        await ensureSupplierTrackingSchema(connection);

        const [[syncStatus]] = await connection.query(
            `SELECT last_success_at, fetched_count, in_stock_count, added_count, updated_count, skipped_count
             FROM supplier_sync_status
             WHERE supplier = 'Core'
             LIMIT 1`
        );

        const [[inventory]] = await connection.query(`
            SELECT
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
                SUM(CASE
                    WHEN status = 'approved'
                     AND EXISTS (
                         SELECT 1
                         FROM product_images pi
                         WHERE pi.product_id = products.id
                     )
                    THEN 1 ELSE 0
                END) AS approved_count,
                COUNT(*) AS usable_count
            FROM products
            WHERE quantity > 0
              AND price > 0
              AND (supplier_source = 'Core'
                   OR (supplier_source IS NULL AND brand IN ('APPLE', 'IPHONE', 'IPAD', 'MACBOOK', 'AIRPODS', 'IMAC', 'MAC', 'IWATCH')))
        `);

        res.status(200).json({
            status: 'success',
            data: {
                sync: syncStatus || null,
                inventory: inventory || {
                    pending_count: 0,
                    approved_count: 0,
                    usable_count: 0
                }
            }
        });
    } catch (err) {
        next(err);
    } finally {
        if (connection) connection.release();
    }
});

// --- FETCH CART FOR LOGGED IN USER ---
/// --- FETCH CART FOR LOGGED IN USER ---
app.get('/api/v1/cart/:userID', async (req, res, next) => {
    try {
        console.log('[Cart API] /cart/:userID GET received for userID:', req.params.userID);
        
        const connection = await db.getConnection();

        // Get regular products from Cart table
        const [cartItems] = await connection.query(`
            SELECT
                c.id,
                c.quantity,
                p.product_name,
                p.price,
                p.id as product_id,
                p.description,
                (SELECT image_url FROM product_images WHERE product_id = p.id LIMIT 1) as image_url,
                NULL as cart_type,
                NULL as duo_config_json
            FROM Cart c
            JOIN Products p ON c.productID = p.id
            WHERE c.userID = ?
              AND (p.is_active = 1 OR p.is_active IS NULL)
        `, [req.params.userID]);

        console.log(`[Cart API] Retrieved ${cartItems.length} regular items from Cart table`);

        // Get digital license items from duo_cart_items table
        const [duoItems] = await connection.query(`
            SELECT
                id,
                1 as quantity,
                NULL as product_name,
                CAST(JSON_EXTRACT(duo_config_json, '$.product_price') AS DECIMAL(10,2)) as price,
                cart_product_id as product_id,
                NULL as description,
                NULL as image_url,
                cart_type,
                duo_config_json
            FROM duo_cart_items
            WHERE userID = ?
        `, [req.params.userID]);

        console.log(`[Cart API] Retrieved ${duoItems.length} digital license items from duo_cart_items table`);

        // Deduplicate digital license items by provider-specific key
        const deduplicatedDuoItems = [];
        const seenLicenses = new Set();
        for (const item of duoItems) {
            let licenseKey = `${item.cart_type}:${item.product_id}`;
            try {
                if (item.duo_config_json && typeof item.duo_config_json === 'string') {
                    const config = JSON.parse(item.duo_config_json);
                    licenseKey = config.organization_name || config.sku || licenseKey;
                } else if (item.duo_config_json) {
                    licenseKey = item.duo_config_json.organization_name || item.duo_config_json.sku || licenseKey;
                }
            } catch (e) { /* keep as-is */ }
            
            if (!seenLicenses.has(licenseKey)) {
                seenLicenses.add(licenseKey);
                deduplicatedDuoItems.push(item);
            }
        }
        console.log(`[Cart API] Deduplicated ${duoItems.length} digital license items → ${deduplicatedDuoItems.length} unique items`);

        // Combine both result sets
        const items = [...cartItems, ...deduplicatedDuoItems];
        console.log(`[Cart API] Total items combined: ${items.length}`);

        // Parse duo_config_json if present
        const normalized = items.map((it) => {
            if (it.duo_config_json && typeof it.duo_config_json === 'string') {
                try { 
                    it.duo_config_json = JSON.parse(it.duo_config_json);
                    console.log('[Cart API] Parsed digital license config for product:', it.cart_type);
                } catch { /* keep as-is */ }
            }
            return it;
        });

        console.log('[Cart API] Returning normalized items:', normalized);
        connection.release();
        res.status(200).json({ status: 'success', data: normalized });
    } catch (err) {
        console.error('[Cart API] Get error:', err);
        next(err);
    }
});

//=================================================================================================//
//                                     CHECKOUT Configuration                                      //
//=================================================================================================//
app.patch('/api/v1/cart/:userID/:productID', async (req, res, next) => {
    const { action } = req.body; // expecting { action: 'increment' } or { action: 'decrement' }
    let connection;
    try {
        const userID = parseInt(req.params.userID);
        const requestedID = parseInt(req.params.productID);
        
        console.log(`[Cart PATCH] userID: ${userID}, requestedID: ${requestedID}, action: ${action}`);
        connection = await db.getConnection();
        await connection.beginTransaction();

        const productID = await resolveCartProductID(connection, userID, requestedID);
        if (!productID) {
            console.warn(`[Cart PATCH] Cart item not found for user ${userID}, identifier ${requestedID}`);
            await connection.rollback();
            return res.status(404).json({ status: 'error', message: 'Cart item not found' });
        }
        
        if (action === 'increment') {
            const [result] = await connection.query('UPDATE Cart SET quantity = quantity + 1 WHERE userID = ? AND productID = ?', 
            [userID, productID]);
            console.log(`[Cart PATCH] ✅ Incremented - affected rows: ${result.affectedRows}`);
            if (result.affectedRows === 0) {
                console.warn(`[Cart PATCH] ⚠️  Product not found for user ${userID}, product ${productID}`);
            }
        } else if (action === 'decrement') {
            const [rows] = await connection.query(
                'SELECT quantity FROM Cart WHERE userID = ? AND productID = ? FOR UPDATE',
                [userID, productID]
            );

            if (!rows.length) {
                await connection.rollback();
                return res.status(404).json({ status: 'error', message: 'Cart item not found' });
            }

            if (Number(rows[0].quantity) <= 1) {
                await connection.query(
                    'DELETE FROM Cart WHERE userID = ? AND productID = ?',
                    [userID, productID]
                );
                await connection.commit();
                console.log(`[Cart PATCH] ✅ Removed product ${productID} after quantity reached zero`);
                return res.status(200).json({ status: 'success', quantity: 0, removed: true });
            }

            await connection.query(
                'UPDATE Cart SET quantity = quantity - 1 WHERE userID = ? AND productID = ?',
                [userID, productID]
            );
            console.log(`[Cart PATCH] ✅ Decremented product ${productID}`);
        } else {
            console.error(`[Cart PATCH] Invalid action: ${action}`);
            await connection.rollback();
            return res.status(400).json({ status: 'error', message: 'Invalid action' });
        }

        const [[updatedItem]] = await connection.query(
            'SELECT quantity FROM Cart WHERE userID = ? AND productID = ?',
            [userID, productID]
        );
        await connection.commit();
        res.status(200).json({ status: 'success', quantity: Number(updatedItem?.quantity || 0), removed: false });
    } catch (err) { 
        console.error('[Cart PATCH] Error:', err.message);
        if (connection) {
            try { await connection.rollback(); } catch (rollbackError) {
                console.error('[Cart PATCH] Rollback error:', rollbackError.message);
            }
        }
        next(err); 
    } finally {
        if (connection) connection.release();
    }
});

// REMOVE FROM DATABASE
app.delete('/api/v1/cart/:userID/:productID', async (req, res, next) => {
    let connection;
    try {
        connection = await db.getConnection();
        const userID = parseInt(req.params.userID);
        const requestedID = parseInt(req.params.productID);
        
        console.log(`[Cart DELETE] userID: ${userID}, requestedID: ${requestedID}`);
        
        if (!userID || !requestedID || isNaN(userID) || isNaN(requestedID)) {
            console.error(`[Cart DELETE] Invalid parameters - userID: ${userID}, requestedID: ${requestedID}`);
            return res.status(400).json({ status: 'error', message: 'Invalid parameters' });
        }

        const productID = await resolveCartProductID(connection, userID, requestedID);
        if (!productID) {
            return res.status(404).json({ status: 'error', message: 'Cart item not found' });
        }

        const [result] = await connection.query(
            'DELETE FROM Cart WHERE userID = ? AND productID = ?',
            [userID, productID]
        );
        console.log(`[Cart DELETE] ✅ Product deleted - affected rows: ${result.affectedRows}`);
        res.status(200).json({ status: 'success', deleted: result.affectedRows > 0 });
    } catch (err) { 
        console.error('[Cart DELETE] Error:', err.message);
        next(err);
    } finally {
        if (connection) connection.release();
    }
});

// Delete one digital license cart row without affecting other Duo or Microsoft items.
app.delete('/api/v1/cart/:userID/digital/:itemID', async (req, res, next) => {
    let connection;
    try {
        connection = await db.getConnection();
        const userID = parseInt(req.params.userID);
        const itemID = parseInt(req.params.itemID);

        if (!userID || !itemID || isNaN(userID) || isNaN(itemID)) {
            return res.status(400).json({ status: 'error', message: 'Invalid parameters' });
        }

        const [result] = await connection.query(
            'DELETE FROM duo_cart_items WHERE userID = ? AND id = ?',
            [userID, itemID]
        );
        res.status(result.affectedRows ? 200 : 404).json({
            status: result.affectedRows ? 'success' : 'error',
            deleted: result.affectedRows > 0,
            message: result.affectedRows ? undefined : 'Digital cart item not found'
        });
    } catch (err) {
        next(err);
    } finally {
        if (connection) connection.release();
    }
});

// Delete specific Duo item by organization name
app.delete('/api/v1/cart/:userID/duo/:orgName', async (req, res, next) => {
    try {
        const connection = await db.getConnection();
        const userID = parseInt(req.params.userID);
        const orgName = decodeURIComponent(req.params.orgName);
        
        console.log(`[Cart DUO DELETE] userID: ${userID}, orgName: ${orgName}`);
        
        // Delete the specific Duo organization from duo_cart_items
        const [result] = await connection.query(`
            DELETE FROM duo_cart_items
            WHERE userID = ? AND JSON_UNQUOTE(JSON_EXTRACT(duo_config_json, '$.organization_name')) = ?
        `, [userID, orgName]);
        
        console.log(`[Cart DUO DELETE] ✅ Deleted - rows affected: ${result.affectedRows}`);
        connection.release();
        res.status(200).json({ status: 'success', deleted: result.affectedRows > 0 });
    } catch (err) { 
        console.error('[Cart DUO DELETE] Error:', err);
        next(err); 
    }
});

// Clear entire cart for user (both regular and Duo items)
app.delete('/api/v1/cart/:userID', async (req, res, next) => {
    try {
        const connection = await db.getConnection();
        const userID = parseInt(req.params.userID);
        
        console.log(`[Cart CLEAR] Clearing entire cart for userID: ${userID}`);
        await connection.beginTransaction();
        
        // Delete regular cart items
        const [regularResult] = await connection.query('DELETE FROM Cart WHERE userID = ?', [userID]);
        console.log(`[Cart CLEAR] Regular items deleted: ${regularResult.affectedRows}`);
        
        // Delete Duo cart items
        await connection.query('DELETE FROM duo_cart_items WHERE userID = ?', [userID]);
        
        await connection.commit();
        connection.release();
        console.log(`[CART] Cleared entire cart for user ${userID}`);
        res.status(200).json({ status: 'success', message: 'Cart cleared' });
    } catch (err) { 
        console.error('[CART] Error clearing cart:', err);
        next(err); 
    }
});

// ----------------- ADDRESS ROUTES -----------------
app.get('/api/v1/addresses/:userID', async (req, res, next) => {
    try {
        const connection = await db.getConnection();
        const [rows] = await connection.query('SELECT * FROM Addresses WHERE userID = ?', [req.params.userID]);
        connection.release();
        res.status(200).json({ status: 'success', data: rows });
    } catch (err) { next(err); }
});

app.post('/api/v1/addresses', async (req, res, next) => {
    try {
        const { userID, line1, line2, city, province, postal_code, country, phone, delivery_instructions, is_default } = req.body;
        if (!userID || !line1 || !city || !postal_code || !country) {
            return res.status(400).json({
                status: 'error',
                message: 'User, address line 1, city, postal code, and country are required.'
            });
        }
        const connection = await db.getConnection();
        try {
            const [result] = await connection.query(
                'INSERT INTO Addresses (userID, line1, line2, city, province, postal_code, country, phone, delivery_instructions, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [userID, line1, line2, city, province, postal_code, country, phone || null, delivery_instructions || null, is_default || 0]
            );
            connection.release();
            res.status(201).json({ status: 'success', data: { id: result.insertId } });
        } catch (err) {
            connection.release();
            throw err;
        }
    } catch (err) { next(err); }
});

app.put('/api/v1/addresses/:id', async (req, res, next) => {
    try {
        const allowedFields = [
            'line1',
            'line2',
            'city',
            'province',
            'postal_code',
            'country',
            'phone',
            'delivery_instructions',
            'is_default'
        ];
        const updates = [];
        const values = [];
        for (const key of allowedFields) {
            if (Object.prototype.hasOwnProperty.call(req.body, key)) {
                updates.push(`${key} = ?`);
                values.push(req.body[key]);
            }
        }
        if (!updates.length) {
            return res.status(400).json({ status: 'error', message: 'No address fields supplied.' });
        }
        const connection = await db.getConnection();
        values.push(req.params.id);
        await connection.query(`UPDATE Addresses SET ${updates.join(', ')} WHERE id = ?`, values);
        connection.release();
        res.status(200).json({ status: 'success' });
    } catch (err) { next(err); }
});

app.delete('/api/v1/addresses/:id', async (req, res, next) => {
    try {
        const connection = await db.getConnection();
        await connection.query('DELETE FROM Addresses WHERE id = ?', [req.params.id]);
        connection.release();
        res.status(204).json({ status: 'success' });
    } catch (err) { next(err); }
});

const contactRequestTimes = new Map();

function escapeSupportText(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

app.post('/api/v1/contact', async (req, res, next) => {
    try {
        const name = String(req.body.name || '').trim();
        const email = String(req.body.email || '').trim().toLowerCase();
        const phone = String(req.body.phone || '').trim();
        const topic = String(req.body.topic || 'General support').trim();
        const orderNumber = String(req.body.orderNumber || '').trim();
        const message = String(req.body.message || '').trim();

        if (!name || !email || !message) {
            return res.status(400).json({
                status: 'error',
                message: 'Name, email, and message are required.'
            });
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ status: 'error', message: 'Enter a valid email address.' });
        }

        if (name.length > 120 || email.length > 180 || phone.length > 50 || topic.length > 100 || orderNumber.length > 80 || message.length > 5000) {
            return res.status(400).json({ status: 'error', message: 'One or more fields are too long.' });
        }

        const requester = req.ip || req.get('x-forwarded-for') || 'unknown';
        const lastRequestAt = contactRequestTimes.get(requester) || 0;
        if (Date.now() - lastRequestAt < 15000) {
            return res.status(429).json({
                status: 'error',
                message: 'Please wait a moment before sending another message.'
            });
        }
        contactRequestTimes.set(requester, Date.now());

        const safe = {
            name: escapeSupportText(name),
            email: escapeSupportText(email),
            phone: escapeSupportText(phone || 'Not supplied'),
            topic: escapeSupportText(topic),
            orderNumber: escapeSupportText(orderNumber || 'Not supplied'),
            message: escapeSupportText(message).replace(/\r?\n/g, '<br>')
        };

        await sendSupportEmail({
            to: EMAIL_SENDERS.support,
            replyTo: email,
            subject: `[ProQ Pilot Support] ${topic} - ${name}`,
            html: `
                <h2>New ProQ Pilot support message</h2>
                <p><strong>Name:</strong> ${safe.name}</p>
                <p><strong>Email:</strong> ${safe.email}</p>
                <p><strong>Phone:</strong> ${safe.phone}</p>
                <p><strong>Topic:</strong> ${safe.topic}</p>
                <p><strong>Order number:</strong> ${safe.orderNumber}</p>
                <hr>
                <p>${safe.message}</p>
            `
        });

        try {
            await sendSupportEmail({
                to: email,
                subject: 'We received your ProQ Pilot support request',
                html: `
                    <h2>Thanks, ${safe.name}</h2>
                    <p>Your message has reached the ProQ Pilot support team.</p>
                    <p><strong>Topic:</strong> ${safe.topic}</p>
                    <p>We will reply to this email address as soon as possible.</p>
                `
            });
        } catch (confirmationError) {
            console.warn('[CONTACT] Support message sent, but confirmation failed:', confirmationError.message);
        }

        res.status(200).json({
            status: 'success',
            message: 'Your message has been sent to ProQ Pilot support.'
        });
    } catch (err) {
        next(err);
    }
});

// ============== MICROSOFT GRAPH EMAIL SETUP ==============
const transporter = {
    sendMail: sendMailOptions,
    verify: async (callback) => {
        try {
            await verifyGraphEmailConfig();
            callback?.(null, true);
        } catch (error) {
            callback?.(error);
        }
    }
};

transporter.verify((error) => {
    if (error) {
        console.error('[EMAIL] Microsoft Graph verification failed:', error.message);
    } else {
        console.log('[EMAIL] Microsoft Graph is ready to send emails');
    }
});

const STORE_DETAILS = {
    name: 'ProQ Pilot',
    email: EMAIL_SENDERS.sales,
    phone: '011 568 9337',
    address: 'Mia Drive, Waterfall City, Johannesburg, 1685'
};

// ========== EMAIL HELPER FUNCTIONS ==========
async function sendCustomerEmail(order, customer, items, address) {
    console.log(`[EMAIL] Starting to send customer email to ${customer.email}`);
    
    const productsHTML = items.map(item => `
        <div style="margin: 16px 0; padding: 16px; background: #f9f9f9; border-radius: 8px;">
            <div style="display: flex; gap: 12px;">
                <img src="${item.image_url.startsWith('http') ? item.image_url : `http://localhost:3000/product_images/${item.image_url}`}" 
                     alt="${item.product_name}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 6px;">
                <div>
                    <h4 style="margin: 0 0 8px 0; font-size: 16px;">${item.product_name}</h4>
                    <p style="margin: 0; color: #666;">Quantity: ${item.quantity}</p>
                    <p style="margin: 0; font-weight: bold; color: #333;">R${parseFloat(item.price).toLocaleString()}</p>
                </div>
            </div>
        </div>
    `).join('');

    const mailOptions = {
        from: `"${STORE_DETAILS.name}" <${EMAIL_SENDERS.sales}>`,
        to: customer.email,
        subject: `Order Confirmation #${order.id} - ProQ Pilot`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #00bcd4 0%, #00d2be 100%); color: white; padding: 24px; text-align: center; border-radius: 8px 8px 0 0;">
                    <h1 style="margin: 0; font-size: 28px;">✓ Order Confirmed</h1>
                    <p style="margin: 8px 0 0 0; font-size: 18px;">Order #${order.id}</p>
                </div>
                
                <div style="padding: 24px; background: white; border: 1px solid #eee;">
                    <h2 style="margin: 0 0 16px 0; color: #333; font-size: 20px;">Thank you, ${customer.username}!</h2>
                    <p style="color: #666; line-height: 1.6;">Your order has been successfully placed. Here are your order details:</p>
                    
                    <h3 style="margin: 20px 0 12px 0; color: #333;">Order Items</h3>
                    ${productsHTML}
                    
                    <h3 style="margin: 20px 0 12px 0; color: #333;">Delivery Address</h3>
                    <p style="margin: 0; color: #666;">${address.line1}${address.line2 ? ', ' + address.line2 : ''}</p>
                    <p style="margin: 0; color: #666;">${address.city}, ${address.province} ${address.postal_code}</p>
                    <p style="margin: 0; color: #666;">${address.country}</p>
                    ${address.phone ? `<p style="margin: 8px 0 0 0; color: #666;"><strong>Phone:</strong> ${address.phone}</p>` : ''}
                    ${address.delivery_instructions ? `<p style="margin: 8px 0 0 0; color: #666;"><strong>Delivery Instructions:</strong> ${address.delivery_instructions}</p>` : ''}
                    
                    <hr style="margin: 20px 0; border: none; border-top: 1px solid #eee;">
                    
                    <div style="background: #f9f9f9; padding: 16px; border-radius: 8px; margin: 16px 0;">
                        <p style="margin: 0 0 8px 0; color: #666; font-size: 14px;">Subtotal</p>
                        <p style="margin: 0 0 12px 0; font-size: 18px; font-weight: bold; color: #333;">R${(order.total_amount -2).toLocaleString()}</p>
                        
                        <p style="margin: 0 0 8px 0; color: #666; font-size: 14px;">Delivery Fee</p>
                        <p style="margin: 0 0 12px 0; font-size: 18px; font-weight: bold; color: #333;">R2.00</p>
                        
                        <hr style="margin: 12px 0; border: none; border-top: 2px solid #00bcd4;">
                        
                        <p style="margin: 0 0 4px 0; color: #666; font-size: 14px;">Total Amount Paid</p>
                        <p style="margin: 0; font-size: 24px; font-weight: bold; color: #00bcd4;">R${parseFloat(order.total_amount).toLocaleString()}</p>
                    </div>
                    
                    <p style="color: #666; font-size: 14px; margin: 16px 0 0 0;"><strong>📦 Expected Delivery:</strong> Within 1 week</p>
                    
                    <a href="http://localhost:3000/order-details.html?orderId=${order.id}" style="display: inline-block; margin-top: 20px; padding: 12px 24px; background: #00bcd4; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">
                        View Order Details
                    </a>
                </div>
                
                <div style="padding: 16px; background: #f9f9f9; text-align: center; border-radius: 0 0 8px 8px; color: #666; font-size: 12px;">
                    <p style="margin: 0;">${STORE_DETAILS.name} | ${STORE_DETAILS.email} | ${STORE_DETAILS.phone}</p>
                    <p style="margin: 8px 0 0 0;">${STORE_DETAILS.address}</p>
                </div>
            </div>
        `
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`[EMAIL] Customer email sent successfully: ${info.messageId}`);
        return true;
    } catch (err) {
        console.error(`[EMAIL] Error sending customer email to ${customer.email}:`, err);
        throw err; // Re-throw to webhook handler
    }
}

async function sendAdminEmail(order, customer, items, address) {
    console.log(`[EMAIL] Starting to send admin email for order #${order.id}`);

    const getVendorName = item => {
        const source = String(item.supplier_source || '').trim();
        if (/tarsus|tarson/i.test(source)) return 'Tarsus';
        if (/core/i.test(source)) return 'Core';
        if (source) return source;

        const brand = String(item.brand || '').toUpperCase();
        return ['APPLE', 'IPHONE', 'IPAD', 'MACBOOK', 'AIRPODS', 'IMAC', 'MAC', 'IWATCH'].includes(brand)
            ? 'Core'
            : 'Tarsus';
    };
    
    const productsHTML = items.map(item => `
        <tr style="border-bottom: 1px solid #ddd;">
            <td style="padding: 12px; text-align: left;">${item.product_name}</td>
            <td style="padding: 12px; text-align: center;">${item.product_number || 'N/A'}</td>
            <td style="padding: 12px; text-align: center; font-weight: bold;">${getVendorName(item)}</td>
            <td style="padding: 12px; text-align: center;">${item.quantity}</td>
            <td style="padding: 12px; text-align: right;">R${parseFloat(item.warehouse_price).toLocaleString()}</td>
            <td style="padding: 12px; text-align: right;">R${parseFloat(item.price).toLocaleString()}</td>
            <td style="padding: 12px; text-align: right;">R${(item.price * item.quantity).toLocaleString()}</td>
        </tr>
    `).join('');

    const mailOptions = {
        from: `"${STORE_DETAILS.name}" <${EMAIL_SENDERS.sales}>`,
        to: ORDER_NOTIFICATION_RECIPIENTS,
        subject: `New Order Received #${order.id} - ProQ Pilot`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 900px; margin: 0 auto;">
                <div style="background: #2c3e50; color: white; padding: 24px; text-align: center;">
                    <h1 style="margin: 0; font-size: 28px;">🎉 New Order Received</h1>
                    <p style="margin: 8px 0 0 0; font-size: 16px;">Order #${order.id}</p>
                </div>
                
                <div style="padding: 24px; background: white; border: 1px solid #ddd;">
                    <h2 style="margin: 0 0 16px 0; color: #2c3e50; border-bottom: 2px solid #00bcd4; padding-bottom: 12px;">Customer Information</h2>
                    <table style="width: 100%; margin-bottom: 24px;">
                        <tr>
                            <td style="padding: 8px 0;"><strong>Customer Name:</strong></td>
                            <td>${customer.username || 'N/A'}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0;"><strong>Customer Email:</strong></td>
                            <td>${customer.email}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0;"><strong>Phone:</strong></td>
                            <td>${address.phone || 'Not provided'}</td>
                        </tr>
                    </table>
                    
                    <h2 style="margin: 20px 0 16px 0; color: #2c3e50; border-bottom: 2px solid #00bcd4; padding-bottom: 12px;">Delivery Address</h2>
                    <p style="margin: 0; color: #333;">${address.line1}${address.line2 ? ', ' + address.line2 : ''}</p>
                    <p style="margin: 4px 0; color: #333;">${address.city}, ${address.province} ${address.postal_code}</p>
                    <p style="margin: 4px 0; color: #333;">${address.country}</p>
                    ${address.delivery_instructions ? `<p style="margin: 12px 0 0 0; color: #666;"><strong>Delivery Instructions:</strong> ${address.delivery_instructions}</p>` : ''}
                    
                    <h2 style="margin: 20px 0 16px 0; color: #2c3e50; border-bottom: 2px solid #00bcd4; padding-bottom: 12px;">Order Items</h2>
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: #f0f0f0; font-weight: bold;">
                                <th style="padding: 12px; text-align: left; border-bottom: 2px solid #ddd;">Product</th>
                                <th style="padding: 12px; text-align: center; border-bottom: 2px solid #ddd;">Product #</th>
                                <th style="padding: 12px; text-align: center; border-bottom: 2px solid #ddd;">Vendor</th>
                                <th style="padding: 12px; text-align: center; border-bottom: 2px solid #ddd;">Qty</th>
                                <th style="padding: 12px; text-align: right; border-bottom: 2px solid #ddd;">Warehouse Price</th>
                                <th style="padding: 12px; text-align: right; border-bottom: 2px solid #ddd;">Retail Price</th>
                                <th style="padding: 12px; text-align: right; border-bottom: 2px solid #ddd;">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${productsHTML}
                        </tbody>
                    </table>
                    
                    <div style="margin-top: 20px; text-align: right; padding: 16px; background: #f9f9f9; border-radius: 6px;">
                        <p style="margin: 0 0 8px 0; color: #666; font-size: 14px;">Subtotal: <strong>R${(order.total_amount - 75).toLocaleString()}</strong></p>
                        <p style="margin: 0 0 12px 0; color: #666; font-size: 14px;">Delivery: <strong>R75.00</strong></p>
                        <p style="margin: 0; font-size: 18px; font-weight: bold; color: #00bcd4;">Total: R${parseFloat(order.total_amount).toLocaleString()}</p>
                    </div>
                    
                    <p style="margin: 20px 0 0 0; color: #666; font-size: 12px; text-align: center;">This is an automated notification. Please do not reply to this email.</p>
                </div>
            </div>
        `
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`[EMAIL] Admin email sent successfully: ${info.messageId}`);
        return true;
    } catch (err) {
        console.error(`[EMAIL] Error sending admin email for order #${order.id}:`, err);
        throw err; // Re-throw to webhook handler
    }
}

// ============== RETRY HELPER FOR DATABASE LOCKS ==============
async function executeWithRetry(operation, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (err) {
            // Retry only on lock timeout errors
            if (err.code === 'ER_LOCK_WAIT_TIMEOUT' && attempt < maxRetries) {
                const delay = Math.pow(2, attempt - 1) * 500; // Exponential backoff: 500ms, 1s, 2s
                console.log(`Lock timeout on attempt ${attempt}, retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            throw err;
        }
    }
}

// ============== NEW CHECKOUT WITH YOCO PAYMENT ==============
app.post('/api/v1/checkout-payment', async (req, res, next) => {
    const { userID, addressID, items } = req.body;
    
    try {
        // Step 1: Create order with items (quick transaction)
        const orderId = await executeWithRetry(async () => {
            let connection;
            try {
                connection = await db.getConnection();
                await connection.beginTransaction();

                // Calculate totals
                const subtotal = items.reduce((s, i) => s + (i.price * i.quantity), 0);
                
                // Use a safe check for cart types
                const hasPhysicalProducts = items.some(i => {
                    const type = i.type || i.cart_type;
                    return !isDigitalLicenseType(type);
                });
                
                const delivery = hasPhysicalProducts ? 75 : 0;
                const totalAmount = subtotal + delivery;

                // Handle digital-only orders where addressID is 0. Set to NULL so the DB constraint doesn't fail.
                const dbAddressId = (addressID === 0 || addressID === '0' || !hasPhysicalProducts) ? null : addressID;

                // Create order with PENDING status
                const [orderRes] = await connection.query(
                    'INSERT INTO Orders (userID, addressID, total_amount, status) VALUES (?, ?, ?, ?)',
                    [userID, dbAddressId, totalAmount, 'pending']
                );
                const orderId = orderRes.insertId;

                // Insert order items
                for (const item of items) {
                    const itemType = item.type || item.cart_type;

                    // Skip inserting virtual digital license products into standard OrderItems
                    if (!isDigitalLicenseType(itemType) && item.id !== 0 && item.id !== '0') {
                        await connection.query(
                            'INSERT INTO OrderItems (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)',
                            [orderId, item.id, item.quantity, item.price]
                        );
                    }

                // Persist digital license purchase configuration safely
                if (isDigitalLicenseType(itemType)) {
                    
                    // Safely extract the configuration object
                    let safeConfig = getDigitalLicenseConfig(item);
                    if (typeof safeConfig === 'string' && !safeConfig.includes('[object Object]')) {
                        try { safeConfig = JSON.parse(safeConfig); } catch(e) {}
                    }

                    await connection.query(
                        `INSERT INTO duo_order_items_meta (order_id, cart_product_id, cart_type, duo_config_json)
                        VALUES (?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE
                            cart_type = VALUES(cart_type),
                            duo_config_json = VALUES(duo_config_json)`,
                        [
                            orderId,
                            String(item.id),
                            itemType,
                            JSON.stringify(safeConfig) // Properly stringified JSON, not [object Object]
                        ]
                    );
                }
                }

                // Create payment record
                await connection.query(
                    'INSERT INTO Payments (order_id, userID, amount, provider, status) VALUES (?, ?, ?, ?, ?)',
                    [orderId, userID, totalAmount, 'YOCO', 'pending']
                );

                await connection.commit();
                connection.release();
                return orderId;
            } catch (err) {
                if (connection) {
                    await connection.rollback();
                    connection.release();
                }
                throw err;
            }
        });

        // Step 2: Get order details for YOCO (including total amount)
        let connection = await db.getConnection();
        const [orders] = await connection.query('SELECT total_amount FROM Orders WHERE id = ?', [orderId]);
        connection.release();
        const totalAmount = orders[0].total_amount;

        // Step 3: Create YOCO checkout (outside transaction, so no lock conflicts)
        const yocoSecretKey = process.env.YOCO_SECRET_KEY;
        if (!yocoSecretKey) throw new Error('YOCO secret key not configured');
        const publicBaseUrl = getPublicBaseUrl(req);

        const yocoResponse = await fetch('https://payments.yoco.com/api/checkouts', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${yocoSecretKey}`,
                'Content-Type': 'application/json',
                'Idempotency-Key': `proq-order-${orderId}`
            },
            body: JSON.stringify({
                amount: Math.round(totalAmount * 100), // Convert to cents
                currency: 'ZAR',
                successUrl: `${publicBaseUrl}/order-success.html?orderId=${orderId}`,
                cancelUrl: `${publicBaseUrl}/review.html`,
                failureUrl: `${publicBaseUrl}/review.html`,
                externalId: `proq-order-${orderId}`,
                clientReferenceId: String(orderId),
                metadata: {
                    orderId: orderId,
                    userID: userID
                }
            })
        });

        if (!yocoResponse.ok) {
            const yocoError = await yocoResponse.text();
            console.error('YOCO checkout creation failed:', yocoResponse.status, yocoError);
            throw new Error('Failed to create YOCO checkout');
        }

        const yocoData = await yocoResponse.json();

        // Step 4: Link YOCO checkout to payment (quick update, low contention)
        connection = await db.getConnection();
        await connection.query(
            'UPDATE Payments SET provider_response = ? WHERE order_id = ?',
            [JSON.stringify({
                yoco_checkout_id: yocoData.id,
                yoco_redirect_url: yocoData.redirectUrl,
                public_base_url: publicBaseUrl,
                mode: 'live'
            }), orderId]
        );
        connection.release();

        res.status(200).json({
            status: 'success',
            data: {
                orderId,
                paymentUrl: yocoData.redirectUrl,
                amount: totalAmount
            }
        });

    } catch (err) {
        console.error('Checkout payment error:', err);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// ============== YOCO WEBHOOK - REAL ORDER FULFILLMENT ==============
app.post('/webhook/yoco-order', async (req, res) => {
    console.log('\n[YOCO WEBHOOK] ===============================================');
    console.log('[YOCO WEBHOOK] ✉️ WEBHOOK RECEIVED FROM YOCO');
    console.log('[YOCO WEBHOOK] ===============================================');
    
    if (!isYocoWebhookSignatureValid(req)) {
        console.error('[YOCO WEBHOOK] Invalid webhook signature. Rejecting event.');
        return res.sendStatus(403);
    }

    const event = req.body;
    console.log('[YOCO WEBHOOK] Event Type:', event?.type);
    const eventCheckoutId = event?.data?.id || event?.metadata?.checkoutId || event?.data?.metadata?.checkoutId;
    console.log('[YOCO WEBHOOK] Checkout ID:', eventCheckoutId);

    if (event?.type === 'checkout.paid') {
        const checkoutId = eventCheckoutId;
        let connection;

        if (!checkoutId) {
            console.error('[YOCO WEBHOOK] Missing checkout id in paid event.');
            return res.sendStatus(200);
        }

        try {
            connection = await db.getConnection();
            console.log('[YOCO WEBHOOK] ✅ Database connection acquired');
            
            await connection.beginTransaction();
            console.log('[YOCO WEBHOOK] ✅ Transaction started');

            // 1. Find the payment and associated order FIRST
            console.log('[YOCO WEBHOOK] Step 1: Looking up payment record for checkout:', checkoutId);
            const [payments] = await connection.query(
                `SELECT p.id as paymentId, p.order_id, p.userID, p.status
                 FROM Payments p
                 WHERE JSON_UNQUOTE(JSON_EXTRACT(provider_response, "$.yoco_checkout_id")) = ?`,
                [checkoutId]
            );

            if (!payments || payments.length === 0) {
                console.log(`[YOCO WEBHOOK] ❌ Payment not found for checkout: ${checkoutId}`);
                await connection.rollback();
                connection.release();
                return res.sendStatus(200);
            }

            const { order_id: orderId, userID, paymentId } = payments[0];
            console.log(`[YOCO WEBHOOK] ✅ Found payment: ID ${paymentId}, Order #${orderId}, User #${userID}`);

            if (payments[0].status === 'paid') {
                console.log(`[YOCO WEBHOOK] ℹ️ Payment ${paymentId} already marked paid. Acknowledging duplicate webhook.`);
                await connection.rollback();
                connection.release();
                return res.sendStatus(200);
            }

            // 2. Update statuses to PAID
            console.log('[YOCO WEBHOOK] Step 2: Updating payment and order status to PAID...');
            await connection.query(
                `UPDATE Payments
                 SET status = "paid",
                     provider_response = JSON_SET(COALESCE(provider_response, JSON_OBJECT()), "$.last_webhook_event", ?)
                 WHERE id = ?`,
                [JSON.stringify(event), paymentId]
            );
            await connection.query('UPDATE Orders SET status = "paid" WHERE id = ?', [orderId]);
            console.log(`[YOCO WEBHOOK] ✅ Order #${orderId} marked as PAID`);

            // 3. Check for Duo items
            console.log('[YOCO WEBHOOK] Step 3: Checking for Duo items in order...');
            const [duoMeta] = await connection.query(
                `SELECT duo_config_json FROM duo_order_items_meta
                 WHERE order_id = ? AND cart_type IN ('duo-security', 'duo-security-upgrade')`,
                [orderId]
            );

            if (duoMeta.length > 0) {
                console.log(`[YOCO WEBHOOK] ✅ Found ${duoMeta.length} Duo item(s)`);
                console.log('[YOCO WEBHOOK] Step 4: INITIATING DUO ACCOUNT PROVISIONING...\n');
                
                // Create Duo account using shared helper function (AWAIT this!)
                try {
                    const duoAccount = await createDuoAccountAfterPayment(orderId, userID, connection);
                    if (duoAccount) {
                        console.log(`\n[YOCO WEBHOOK] ✅ DUO ACCOUNT PROVISIONING SUCCESSFUL`);
                        console.log(`[YOCO WEBHOOK] Account ID: ${duoAccount.account_id}`);
                        console.log(`[YOCO WEBHOOK] Organization: ${duoAccount.organization_name}`);
                        console.log(`[YOCO WEBHOOK] Hostname: ${duoAccount.api_hostname}\n`);
                    } else {
                        console.log(`\n[YOCO WEBHOOK] ⚠️ DUO PROVISIONING SKIPPED (No valid config)\n`);
                    }
                } catch (duoErr) {
                    console.error(`\n[YOCO WEBHOOK] ❌ DUO PROVISIONING ERROR`);
                    console.error(`[YOCO WEBHOOK] Error:`, duoErr.message);
                    console.error(`[YOCO WEBHOOK] (Payment already confirmed, continuing with webhook)\n`);
                    // Don't fail the whole webhook - payment already confirmed
                }
            } else {
                console.log('[YOCO WEBHOOK] ℹ️ No Duo items found - skipping Duo provisioning');
            }

            // 4. Fetch full order and user info for emails
            console.log('[YOCO WEBHOOK] Step 5: Fetching order and user details...');
            const [orderRows] = await connection.query(
                `SELECT o.*, u.email, CONCAT(u.firstName, ' ', u.lastName) as username,
                        a.line1, a.line2, a.city, a.province, a.postal_code, a.country, a.phone, a.delivery_instructions
                 FROM Orders o 
                 JOIN users u ON o.userID = u.userID 
                 LEFT JOIN Addresses a ON o.addressID = a.id
                 WHERE o.id = ?`,
                [orderId]
            );

            const orderDetail = orderRows[0];
            console.log(`[YOCO WEBHOOK] ✅ Order details retrieved for user: ${orderDetail.username} (${orderDetail.email})`);

            // 5. Fetch items for email
            console.log('[YOCO WEBHOOK] Step 6: Fetching order items...');
            const [items] = await connection.query(
                `SELECT oi.*, p.product_name, p.product_number, p.warehouse_price, p.supplier_source, p.brand,
                 (SELECT image_url FROM product_images WHERE product_id = p.id LIMIT 1) as image_url
                 FROM OrderItems oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?`,
                [orderId]
            );
            console.log(`[YOCO WEBHOOK] ✅ Found ${items.length} order item(s)`);

            await connection.commit();
            console.log('[YOCO WEBHOOK] ✅ Transaction committed');

            // 6. Trigger Emails (Async - don't await so webhook finishes fast)
            console.log('[YOCO WEBHOOK] Step 7: Queueing confirmation emails...');
            sendCustomerEmail(orderDetail, { username: orderDetail.username, email: orderDetail.email }, items, orderDetail)
                .then(() => console.log('[YOCO WEBHOOK] ✅ Customer email sent'))
                .catch(e => console.error("[YOCO WEBHOOK] ❌ Customer email error:", e.message));
            
            sendAdminEmail(orderDetail, { username: orderDetail.username, email: orderDetail.email }, items, orderDetail)
                .then(() => console.log('[YOCO WEBHOOK] ✅ Admin email sent'))
                .catch(e => console.error("[YOCO WEBHOOK] ❌ Admin email error:", e.message));

            console.log('\n[YOCO WEBHOOK] ===============================================');
            console.log('[YOCO WEBHOOK] ✅ WEBHOOK PROCESSING COMPLETE');
            console.log('[YOCO WEBHOOK] ===============================================\n');
            
            res.sendStatus(200);

        } catch (err) {
            if (connection) await connection.rollback();
            console.error(`\n[YOCO WEBHOOK] ❌ FATAL ERROR`);
            console.error(`[YOCO WEBHOOK] Error:`, err.message);
            console.error(`[YOCO WEBHOOK] Stack:`, err.stack);
            console.error('[YOCO WEBHOOK] ===============================================\n');
            res.sendStatus(200); // Acknowledge Yoco regardless
        } finally {
            if (connection) connection.release();
        }
    } else {
        res.sendStatus(200);
    }
});

// ============== TEST WEBHOOK - MANUAL TRIGGER FOR TESTING ==============
app.post('/webhook/yoco-order-test/:orderId', async (req, res) => {
    const { orderId } = req.params;
    console.log(`\n[TEST-WEBHOOK] ===== MANUAL WEBHOOK TEST FOR ORDER #${orderId} =====`);
    
    let connection;

    try {
        connection = await db.getConnection();

        // Check if order exists
        const [orderCheck] = await connection.query('SELECT id, status FROM Orders WHERE id = ?', [orderId]);
        if (!orderCheck || orderCheck.length === 0) {
            connection.release();
            return res.status(404).json({ status: 'error', message: `Order #${orderId} not found` });
        }

        console.log(`[TEST-WEBHOOK] Order #${orderId} found. Current status: ${orderCheck[0].status}`);

        // Check if Duo items exist
        const [duoItems] = await connection.query(
            `SELECT duo_config_json FROM duo_order_items_meta
             WHERE order_id = ? AND cart_type IN ('duo-security', 'duo-security-upgrade')`,
            [orderId]
        );
        console.log(`[TEST-WEBHOOK] Found ${duoItems.length} Duo item(s)`);

        if (duoItems.length > 0) {
            const config = safeJsonParse(duoItems[0].duo_config_json);
            console.log(`[TEST-WEBHOOK] Duo Config: ${JSON.stringify(config, null, 2)}`);
        }

        // Update payment status to PAID
        await connection.query(
            'UPDATE Payments SET status = ? WHERE order_id = ?',
            ['paid', orderId]
        );
        console.log(`[TEST-WEBHOOK] Updated payment status to PAID for order #${orderId}`);

        // Update order status to PAID
        await connection.query(
            'UPDATE Orders SET status = ? WHERE id = ?',
            ['paid', orderId]
        );
        console.log(`[TEST-WEBHOOK] Updated order status to PAID for order #${orderId}`);

        // Fetch full order details for emails
        const [orders] = await connection.query(
            `SELECT o.id, o.userID, o.total_amount, o.addressID, CONCAT(u.firstName, ' ', u.lastName) as username, u.email,
                    a.line1, a.line2, a.city, a.province, a.postal_code, a.country, a.phone, a.delivery_instructions
            FROM Orders o
            JOIN users u ON o.userID = u.userID
            JOIN Addresses a ON o.addressID = a.id
            WHERE o.id = ?`,
            [orderId]
        );

        if (!orders || orders.length === 0) {
            connection.release();
            return res.status(404).json({ status: 'error', message: 'Order details not found' });
        }

        const order = orders[0];
        console.log(`[TEST-WEBHOOK] Fetched order #${orderId}, customer: ${order.email}`);

        // Fetch order items with product details
        const [items] = await connection.query(
            `SELECT oi.quantity, oi.price, p.id as product_id, p.product_name, p.product_number,
                    p.warehouse_price, p.supplier_source, p.brand, pi.image_url
            FROM OrderItems oi
            JOIN products p ON oi.product_id = p.id
            LEFT JOIN product_images pi ON p.id = pi.product_id AND pi.is_primary = true
            WHERE oi.order_id = ?`,
            [orderId]
        );

        // If no primary image, get first image
        for (let item of items) {
            if (!item.image_url) {
                const [images] = await connection.query(
                    'SELECT image_url FROM product_images WHERE product_id = ? LIMIT 1',
                    [item.product_id]
                );
                item.image_url = images.length > 0 ? images[0].image_url : '/Images/placeholder.png';
            }
        }

        connection.release();
        console.log(`[TEST-WEBHOOK] Fetched ${items.length} order items`);

        // Send customer confirmation email
        console.log(`[TEST-WEBHOOK] Sending customer email to ${order.email}`);
        try {
            await sendCustomerEmail(order, { username: order.username, email: order.email }, items, order);
            console.log(`[TEST-WEBHOOK] ✓ Customer email sent successfully`);
        } catch (emailErr) {
            console.error(`[TEST-WEBHOOK] ✗ Failed to send customer email:`, emailErr.message);
        }

        // Send admin notification email
        console.log(`[TEST-WEBHOOK] Sending admin email`);
        try {
            await sendAdminEmail(order, { username: order.username, email: order.email }, items, order);
            console.log(`[TEST-WEBHOOK] ✓ Admin email sent successfully`);
        } catch (emailErr) {
            console.error(`[TEST-WEBHOOK] ✗ Failed to send admin email:`, emailErr.message);
        }

        console.log(`[TEST-WEBHOOK] ===== TEST COMPLETED FOR ORDER #${orderId} =====\n`);

        res.status(200).json({
            status: 'success',
            message: `Test webhook processed for order #${orderId}`,
            order: {
                id: order.id,
                customer: order.email,
                total_amount: order.total_amount,
                items_count: items.length
            }
        });

    } catch (err) {
        if (connection) connection.release();
        console.error(`[TEST-WEBHOOK] Error:`, err);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// ============== DEBUG: Check pending orders ==============
app.get('/api/v1/debug/orders/pending', async (req, res) => {
    let connection;
    try {
        connection = await db.getConnection();
        
        // Get orders that are still pending and have Duo items
        const [pendingOrders] = await connection.query(`
            SELECT 
                o.id as orderId,
                o.userID,
                o.status as orderStatus,
                p.status as paymentStatus,
                COUNT(duo.id) as duoItemCount
            FROM Orders o
            LEFT JOIN Payments p ON o.id = p.order_id
            LEFT JOIN duo_order_items_meta duo ON o.id = duo.order_id
            WHERE o.status IN ('pending', 'paid')
            GROUP BY o.id, o.userID, o.status, p.status
            ORDER BY o.id DESC
            LIMIT 20
        `);
        
        connection.release();
        
        res.json({
            success: true,
            message: `Found ${pendingOrders.length} orders requiring webhook processing`,
            orders: pendingOrders.map(o => ({
                ...o,
                testWebhookUrl: `/webhook/yoco-order-test/${o.orderId}`
            }))
        });
        
    } catch (err) {
        if (connection) connection.release();
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============== DEBUG: Get specific order details ==============
app.get('/api/v1/debug/order/:orderId', async (req, res) => {
    let connection;
    try {
        const { orderId } = req.params;
        connection = await db.getConnection();
        
        // Get order details
        const [orders] = await connection.query(
            'SELECT * FROM Orders WHERE id = ?',
            [orderId]
        );
        
        if (!orders.length) {
            connection.release();
            return res.status(404).json({ success: false, error: `Order ${orderId} not found` });
        }
        
        // Get payment details
        const [payments] = await connection.query(
            'SELECT * FROM Payments WHERE order_id = ?',
            [orderId]
        );
        
        // Get Duo items
        const [duoItems] = await connection.query(
            'SELECT id, cart_product_id, cart_type, duo_config_json FROM duo_order_items_meta WHERE order_id = ?',
            [orderId]
        );
        
        // Parse Duo configs
        const duoItemsWithConfig = duoItems.map(item => ({
            ...item,
            duo_config_json: safeJsonParse(item.duo_config_json)
        }));
        
        connection.release();
        
        res.json({
            success: true,
            order: orders[0],
            payment: payments[0] || null,
            duoItems: duoItemsWithConfig,
            testWebhookUrl: `/webhook/yoco-order-test/${orderId}`
        });
        
    } catch (err) {
        if (connection) connection.release();
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============== LEGACY CHECKOUT (keeping for compatibility) ==============
app.post('/api/v1/checkout', async (req, res, next) => {
    // For backwards compatibility - redirects to payment endpoint
    const { userID, addressID, items } = req.body;
    try {
        res.status(200).json({
            status: 'success',
            message: 'Use /api/v1/checkout-payment for YOCO integration',
            data: { orderId: null }
        });
    } catch (err) {
        next(err);
    }
});

// ============== GET ORDER DETAILS (RESILIENT VERSION) ==============
app.get('/api/v1/orders/:orderId', async (req, res, next) => {
    const { orderId } = req.params;
    let connection;

    try {
        console.log(`[API] Fetching order #${orderId}`);
        connection = await db.getConnection();

        // 1. Fetch order with LEFT JOIN for address (essential for digital items)
        const [orders] = await connection.query(
            `SELECT o.id, o.total_amount, o.status, o.created_at, o.addressID, 
                    CONCAT(u.firstName, ' ', u.lastName) as username, u.email,
                    a.line1, a.line2, a.city, a.province, a.postal_code, a.country, a.phone, a.delivery_instructions
            FROM Orders o
            JOIN users u ON o.userID = u.userID
            LEFT JOIN Addresses a ON o.addressID = a.id
            WHERE o.id = ?`,
            [orderId]
        );

        if (!orders || orders.length === 0) {
            console.warn(`[API] Order #${orderId} not found in database.`);
            return res.status(404).json({ status: 'error', message: 'Order not found' });
        }

        const order = orders[0];

        // 2. Add fallback strings for NULL address fields to prevent frontend "undefined" crashes
        if (!order.addressID) {
            order.line1 = "Digital Delivery";
            order.line2 = "Check Email for License Keys";
            order.city = "Online";
            order.province = "Digital";
            order.postal_code = "N/A";
            order.country = "South Africa";
        }

        // 3. Fetch Standard Items
        const [standardItems] = await connection.query(
            `SELECT oi.quantity, oi.price, p.id as product_id, p.product_name, pi.image_url
             FROM OrderItems oi
             JOIN products p ON oi.product_id = p.id
             LEFT JOIN product_images pi ON p.id = pi.product_id AND pi.is_primary = true
             WHERE oi.order_id = ?`,
            [orderId]
        );

        // 4. Fetch digital license metadata items (for items that don't exist in the products table)
        const [duoItems] = await connection.query(
            `SELECT 1 as quantity, 0 as price, 0 as product_id,
                    CASE WHEN dm.cart_type = 'microsoft-license' THEN 'Microsoft License' ELSE 'Cisco Duo Security' END as product_name,
                    CASE WHEN dm.cart_type = 'microsoft-license' THEN '/Images/Logos/Proq2.png' ELSE '/Images/DUO.png' END as image_url,
                    dm.cart_type, dm.duo_config_json
             FROM duo_order_items_meta dm
             WHERE dm.order_id = ?`,
            [orderId]
        );

        // 5. Combine and resolve pricing for digital license items
        let finalItems = [...standardItems];
        
        duoItems.forEach(di => {
            try {
                const config = safeJsonParse(di.duo_config_json, {});
                di.price = config.product_price || 0;
                di.product_name = config.product_name || di.product_name;
            } catch (e) {
                console.error('Error parsing digital license config:', e);
            }

            finalItems.push(di);
        });

        console.log(`[API] Successfully loaded order #${orderId} with ${finalItems.length} items.`);

        res.status(200).json({
            status: 'success',
            data: {
                ...order,
                items: finalItems
            }
        });

    } catch (err) {
        console.error(`[API] ERROR fetching order #${orderId}:`, err);
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    } finally {
        if (connection) connection.release();
    }
});

//=================================================================================================================//
//                                        WISH LIST ENDPOINTS                                                      //
//=================================================================================================================//

// ADD ITEM TO WISHLIST
app.post('/api/v1/wishlist/add', async (req, res, next) => {
    const { userID, productID } = req.body;

    try {
        if (!userID || !productID) {
            return res.status(400).json({ 
                status: 'error', 
                message: 'userID and productID are required' 
            });
        }

        const connection = await db.getConnection();
        
        // Check if item already in wishlist
        const [existing] = await connection.query(
            'SELECT id FROM wishlist WHERE user_id = ? AND product_id = ?',
            [userID, productID]
        );

        if (existing.length > 0) {
            connection.release();
            return res.status(400).json({ 
                status: 'error', 
                message: 'Item already in wishlist' 
            });
        }

        // Insert into wishlist
        await connection.query(
            'INSERT INTO wishlist (user_id, product_id) VALUES (?, ?)',
            [userID, productID]
        );

        connection.release();
        res.status(201).json({ 
            status: 'success', 
            message: 'Item added to wishlist' 
        });
    } catch (err) {
        next(err);
    }
});

// GET ALL WISHLIST ITEMS FOR USER
app.get('/api/v1/wishlist/:userID', async (req, res, next) => {
    try {
        const connection = await db.getConnection();
        
        const [items] = await connection.query(`
            SELECT 
                w.id as wishlist_id,
                w.product_id as id,
                p.id as productId,
                p.product_name as name,
                p.description,
                p.price,
                (SELECT image_url FROM product_images WHERE product_id = p.id LIMIT 1) as image,
                p.quantity,
                w.created_at
            FROM wishlist w
            INNER JOIN Products p ON w.product_id = p.id
            WHERE w.user_id = ? AND (p.is_active = 1 OR p.is_active IS NULL)
            ORDER BY w.created_at DESC
        `, [req.params.userID]);

        connection.release();
        res.status(200).json({ 
            status: 'success', 
            data: items 
        });
    } catch (err) {
        next(err);
    }
});

// GET WISHLIST COUNT FOR USER
app.get('/api/v1/wishlist/count/:userID', async (req, res, next) => {
    try {
        const connection = await db.getConnection();
        
        const [result] = await connection.query(`
            SELECT COUNT(*) as count
            FROM wishlist w
            INNER JOIN Products p ON w.product_id = p.id
            WHERE w.user_id = ? AND (p.is_active = 1 OR p.is_active IS NULL)
        `, [req.params.userID]);

        connection.release();
        res.status(200).json({ 
            status: 'success', 
            data: result[0]?.count || 0 
        });
    } catch (err) {
        next(err);
    }
});

// REMOVE ITEM FROM WISHLIST
app.delete('/api/v1/wishlist/:productID', async (req, res, next) => {
    const { userID } = req.body;

    try {
        if (!userID) {
            return res.status(400).json({ 
                status: 'error', 
                message: 'userID is required' 
            });
        }

        const connection = await db.getConnection();
        
        await connection.query(
            'DELETE FROM wishlist WHERE user_id = ? AND product_id = ?',
            [userID, req.params.productID]
        );

        connection.release();
        res.status(200).json({ 
            status: 'success', 
            message: 'Item removed from wishlist' 
        });
    } catch (err) {
        next(err);
    }
});

// CHECK IF ITEM IS IN WISHLIST
app.get('/api/v1/wishlist/check/:userID/:productID', async (req, res, next) => {
    try {
        const connection = await db.getConnection();
        
        const [result] = await connection.query(
            'SELECT id FROM wishlist WHERE user_id = ? AND product_id = ?',
            [req.params.userID, req.params.productID]
        );

        connection.release();
        res.status(200).json({ 
            status: 'success', 
            data: {
                inWishlist: result.length > 0
            }
        });
    } catch (err) {
        next(err);
    }
});


//=================================================================================================================//
//                                        ADMIN DASHBOARD ENDPOINTS                                                //
//=================================================================================================================//

app.get('/api/v1/admin/dashboard-stats', async (req, res, next) => {
    let connection;
    try {
        connection = await db.getConnection();

        // 1. Total Sales (Today, Week, Month)
        const [todaySales] = await connection.query("SELECT SUM(total_amount) as total FROM Orders WHERE DATE(created_at) = CURDATE() AND status != 'pending'");
        const [weekSales] = await connection.query("SELECT SUM(total_amount) as total FROM Orders WHERE YEARWEEK(created_at, 1) = YEARWEEK(CURDATE(), 1) AND status != 'pending'");
        const [monthSales] = await connection.query("SELECT SUM(total_amount) as total FROM Orders WHERE MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE()) AND status != 'pending'");

        // 2. Orders Count by Status
        const [orderStats] = await connection.query("SELECT status, COUNT(*) as count FROM Orders GROUP BY status");

        // 3. Revenue & Average Order Value
        const [revenueStats] = await connection.query("SELECT SUM(total_amount) as revenue, AVG(total_amount) as aov FROM Orders WHERE status != 'pending'");

        // 4. New vs Returning Customers
        const [totalCustomers] = await connection.query("SELECT COUNT(*) as count FROM users WHERE role = 'client'");
        const [returningCustomers] = await connection.query("SELECT COUNT(*) as count FROM (SELECT userID FROM Orders GROUP BY userID HAVING COUNT(id) > 1) as returning");

        // 5. Low-stock alerts
        const [lowStock] = await connection.query("SELECT product_name, quantity FROM products WHERE quantity < 5 ORDER BY quantity ASC LIMIT 10");

        // 6. Recent Activity
        const [recentActivity] = await connection.query(`
            SELECT o.id, u.email, o.total_amount, o.status, o.created_at 
            FROM Orders o 
            JOIN users u ON o.userID = u.userID 
            ORDER BY o.created_at DESC LIMIT 8
        `);

        // 7. Weekly Sales (Last 7 Days)
        const [weeklySalesData] = await connection.query(`
            SELECT DATE(created_at) as date, SUM(total_amount) as total 
            FROM Orders 
            WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) AND status != 'pending'
            GROUP BY DATE(created_at)
            ORDER BY date ASC
        `);

        // 8. Monthly Sales (Last 6 Months)
        const [monthlySalesData] = await connection.query(`
            SELECT DATE_FORMAT(created_at, '%Y-%m') as month, SUM(total_amount) as total 
            FROM Orders 
            WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 5 MONTH) AND status != 'pending'
            GROUP BY month
            ORDER BY month ASC
        `);

        res.status(200).json({
            status: 'success',
            data: {
                sales: {
                    today: todaySales[0].total || 0,
                    week: weekSales[0].total || 0,
                    month: monthSales[0].total || 0,
                    weeklyTrend: weeklySalesData,
                    monthlyTrend: monthlySalesData
                },
                orders: orderStats,
                metrics: {
                    totalRevenue: revenueStats[0].revenue || 0,
                    averageOrderValue: revenueStats[0].aov || 0
                },
                customers: {
                    total: totalCustomers[0].count || 0,
                    returning: returningCustomers[0]?.count || 0
                },
                lowStock,
                recentActivity
            }
        });

    } catch (err) {
        next(err);
    } finally {
        if (connection) connection.release();
    }
});


// GLOBAL ERROR HANDLER
app.use((err, req, res, next) => {
    err.statusCode = err.statusCode || 500;
    err.status = err.status || 'error';

    res.status(err.statusCode).json({
        status: err.status,
        message: err.message
    });
});

// ============== DEBUG: Manual Duo Account Creation Test ==============
// Use this endpoint to test Duo provisioning without waiting for webhook
// GET /test/duo-provision?orderId=27&userId=1
app.get('/test/duo-provision', catchAsync(async (req, res) => {
    const { orderId, userId } = req.query;
    
    console.log('\n[TEST ENDPOINT] ═════════════════════════════════════════════');
    console.log(`[TEST ENDPOINT] Manual Duo Provisioning Test`);
    console.log(`[TEST ENDPOINT] Order ID: ${orderId}, User ID: ${userId}`);
    console.log('[TEST ENDPOINT] ═════════════════════════════════════════════\n');
    
    if (!orderId || !userId) {
        return res.status(400).json({
            error: 'Missing parameters. Usage: /test/duo-provision?orderId=27&userId=1'
        });
    }

    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        console.log('[TEST ENDPOINT] Fetching order details...');
        const [orders] = await connection.query('SELECT * FROM Orders WHERE id = ?', [orderId]);
        
        if (orders.length === 0) {
            connection.release();
            return res.status(404).json({ error: `Order #${orderId} not found` });
        }

        const order = orders[0];
        console.log(`[TEST ENDPOINT] ✅ Order found: #${orderId}`);

        console.log('[TEST ENDPOINT] Fetching Duo items...');
        const [duoItems] = await connection.query(
            `SELECT * FROM duo_order_items_meta
             WHERE order_id = ? AND cart_type IN ('duo-security', 'duo-security-upgrade')`,
            [orderId]
        );

        if (duoItems.length === 0) {
            await connection.commit();
            connection.release();
            return res.status(404).json({ 
                error: `No Duo items found for order #${orderId}`,
                suggestion: 'This order may not have a Duo license purchase'
            });
        }

        console.log(`[TEST ENDPOINT] ✅ Found ${duoItems.length} Duo item(s)`);

        // Now trigger provisioning
        console.log('[TEST ENDPOINT] TRIGGERING DUO ACCOUNT PROVISIONING...\n');
        const duoAccount = await createDuoAccountAfterPayment(orderId, userId, connection);

        await connection.commit();
        connection.release();

        console.log('\n[TEST ENDPOINT] ═════════════════════════════════════════════');
        console.log('[TEST ENDPOINT] ✅ TEST COMPLETE');
        console.log('[TEST ENDPOINT] ═════════════════════════════════════════════\n');

        res.json({
            success: true,
            message: 'Duo provisioning triggered successfully',
            duoAccount: duoAccount,
            orderId: orderId,
            userId: userId
        });

    } catch (err) {
        if (connection) await connection.rollback();
        console.error('[TEST ENDPOINT] ❌ Error:', err.message);
        console.log('[TEST ENDPOINT] ═════════════════════════════════════════════\n');
        connection?.release();
        
        res.status(500).json({
            error: 'Provisioning failed',
            message: err.message,
            suggestion: 'Check server logs for detailed error information'
        });
    }
}));

// Cloud Run injects PORT. Local development falls back to 3000.
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
