/**
 * Duo License API Utility
 * Handles authentication and API calls to Duo Accounts API and Admin API
 */

const crypto = require('crypto');
const https = require('https');
require('dotenv').config();

const DUO_IKEY = process.env.DUO_IKEY;
const DUO_SKEY = process.env.DUO_SKEY;
const DUO_HOST = process.env.DUO_HOST;

/**
 * Generate HMAC-SHA1 signature for Duo API request
 * Per Duo API spec: https://duo.com/docs/duosec
 * @param {string} method - HTTP method (GET, POST, etc.)
 * @param {string} path - API path
 * @param {string} body - Request body (for POST requests)
 * @param {string} hostname - API hostname (defaults to parent)
 * @returns {object} - Headers with Authorization and Date
 */
function generateDuoHeaders(method, path, body = '', hostname = null) {
  const host = hostname || DUO_HOST;
  
  // Generate RFC 2822 formatted date
  const now = new Date();
  const date = now.toUTCString();

  // Create canonical string for signing (RFC 2822 date, NOT unix timestamp)
  // Format: [date]\n[method]\n[hostname]\n[path]\n[body]
  let canonicalString = [
    date,
    method.toUpperCase(),
    host.toLowerCase(),
    path,
    body
  ].join('\n');

  console.log('[Duo Auth] Canonical String:', canonicalString.substring(0, 100) + '...');

  // Sign with HMAC-SHA1
  const signature = crypto
    .createHmac('sha1', DUO_SKEY)
    .update(canonicalString)
    .digest('hex');

  // Create Authorization header (Basic auth with ikey:signature)
  const authString = `${DUO_IKEY}:${signature}`;
  const authHeader = Buffer.from(authString).toString('base64');

  return {
    'Authorization': `Basic ${authHeader}`,
    'Date': date,
    'Content-Type': 'application/x-www-form-urlencoded'
  };
}

/**
 * Make a HTTPS request to Duo API
 * @param {string} method - HTTP method
 * @param {string} path - API path
 * @param {object} body - Request body (for POST requests)
 * @param {string} hostname - Optional API hostname (for child accounts)
 * @returns {Promise<object>} - API response
 */
function makeDuoRequest(method, path, body = {}, hostname = null) {
  return new Promise((resolve, reject) => {
    const host = hostname || DUO_HOST;
    
    // Convert body object to query string (sorted alphabetically for consistent signature)
    const bodyString = Object.keys(body)
      .sort()
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(body[key])}`)
      .join('&');

    console.log('\n[DUO API HTTP REQUEST] ─────────────────────────────────────');
    console.log(`[DUO API HTTP REQUEST] ${method.toUpperCase()} ${path}`);
    console.log(`[DUO API HTTP REQUEST] Hostname: ${host}`);
    if (bodyString) {
      console.log(`[DUO API HTTP REQUEST] Body: ${bodyString}`);
    }

    const headers = generateDuoHeaders(method, path, bodyString, host);
    
    // Add Content-Length header for POST requests
    if (bodyString) {
      headers['Content-Length'] = Buffer.byteLength(bodyString, 'utf8');
    }

    const options = {
      hostname: host,
      port: 443,
      path: path,
      method: method.toUpperCase(),
      headers: headers
    };

    console.log(`[DUO API HTTP REQUEST] Sending request...`);

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        console.log(`[DUO API HTTP RESPONSE] Status: ${res.statusCode}`);
        try {
          const parsed = JSON.parse(data);
          console.log(`[DUO API HTTP RESPONSE] Body:`, JSON.stringify(parsed, null, 2));
          console.log(`[DUO API HTTP RESPONSE] ─────────────────────────────────────\n`);
          
          if (parsed.stat === 'OK') {
            resolve(parsed.response);
          } else {
            reject(new Error(`Duo API Error: ${parsed.message || 'Unknown error'}`));
          }
        } catch (err) {
          console.error(`[DUO API HTTP RESPONSE] Parse Error:`, err.message);
          console.error(`[DUO API HTTP RESPONSE] Raw Response:`, data);
          console.log(`[DUO API HTTP RESPONSE] ─────────────────────────────────────\n`);
          reject(err);
        }
      });
    });

    req.on('error', (err) => {
      console.error(`[DUO API HTTP ERROR] Connection Error:`, err.message);
      console.log(`[DUO API HTTP RESPONSE] ─────────────────────────────────────\n`);
      reject(err);
    });

    if (bodyString) {
      req.write(bodyString);
    }
    req.end();
  });
}

/**
 * Create a new Duo child account
 * @param {string} accountName - Name for the new account
 * @returns {Promise<object>} - Created account details (account_id, api_hostname)
 */
async function createDuoAccount(accountName) {
  console.log('\n[DUO API CALL] ═════════════════════════════════════════════');
  console.log(`[DUO API CALL] Function: createDuoAccount`);
  console.log(`[DUO API CALL] Account Name: "${accountName}"`);
  console.log('[DUO API CALL] Endpoint: POST /accounts/v1/account/create');
  
  try {
    const body = {
      name: accountName
    };

    const response = await makeDuoRequest(
      'POST',
      '/accounts/v1/account/create',
      body
    );

    console.log(`[DUO API CALL] ✅ SUCCESS`);
    console.log(`[DUO API CALL] Account ID: ${response.account_id}`);
    console.log(`[DUO API CALL] API Hostname: ${response.api_hostname}`);
    console.log('[DUO API CALL] ═════════════════════════════════════════════\n');
    
    // VERIFICATION: List all accounts to confirm creation
    console.log(`[DUO API VERIFICATION] Confirming account creation by listing all accounts...\n`);
    try {
      const allAccounts = await listAllAccounts();
      
      const foundAccount = allAccounts.find(acc => acc.account_id === response.account_id);
      if (foundAccount) {
        console.log(`[DUO API VERIFICATION] ✅ VERIFIED - Account found in Duo system!`);
        console.log(`[DUO API VERIFICATION] Name: ${foundAccount.name}`);
        console.log(`[DUO API VERIFICATION] Account ID: ${foundAccount.account_id}`);
        console.log(`[DUO API VERIFICATION] API Hostname: ${foundAccount.api_hostname}\n`);
      } else {
        console.warn(`[DUO API VERIFICATION] ⚠️ WARNING - Account ID not found in account list!`);
        console.warn(`[DUO API VERIFICATION] This may indicate a sync delay. Proceeding anyway.\n`);
      }
    } catch (verifyErr) {
      console.warn(`[DUO API VERIFICATION] ⚠️ Could not verify account creation:`, verifyErr.message);
      console.warn(`[DUO API VERIFICATION] Proceeding anyway with account ID: ${response.account_id}\n`);
    }
    
    return {
      account_id: response.account_id,
      api_hostname: response.api_hostname
    };
  } catch (error) {
    console.error(`[DUO API CALL] ❌ FAILED`);
    console.error(`[DUO API CALL] Error: ${error.message}`);
    console.log('[DUO API CALL] ═════════════════════════════════════════════\n');
    throw new Error(`Failed to create Duo account: ${error.message}`);
  }
}

/**
 * Update Hard User Limit for a Duo account
 * @param {string} accountId - Duo account ID
 * @param {string} apiHostname - API hostname for the account (child's hostname)
 * @param {number} userLimit - Number of users to set as limit
 * @returns {Promise<object>} - Update response
 */
async function updateHardUserLimit(accountId, apiHostname, userLimit) {
  console.log('\n[DUO API CALL] ═════════════════════════════════════════════');
  console.log(`[DUO API CALL] Function: updateHardUserLimit`);
  console.log(`[DUO API CALL] Account ID: ${accountId}`);
  console.log(`[DUO API CALL] API Hostname: ${apiHostname}`);
  console.log(`[DUO API CALL] User Limit: ${userLimit}`);
  console.log(`[DUO API CALL] Endpoint: PUT /admin/v1/accounts/${accountId}/settings/hard_user_limit`);
  
  try {
    const body = {
      hard_limit: userLimit.toString()
    };

    // The Admin API endpoint to update Hard User Limit
    const path = `/admin/v1/accounts/${accountId}/settings/hard_user_limit`;

    const response = await makeDuoRequest(
      'PUT',
      path,
      body,
      apiHostname  // Pass child account's hostname
    );

    console.log(`[DUO API CALL] ✅ SUCCESS - User limit set to ${userLimit}`);
    console.log('[DUO API CALL] ═════════════════════════════════════════════\n');
    
    return response;
  } catch (error) {
    console.error(`[DUO API CALL] ❌ FAILED`);
    console.error(`[DUO API CALL] Error: ${error.message}`);
    console.log('[DUO API CALL] ═════════════════════════════════════════════\n');
    throw new Error(`Failed to update Hard User Limit: ${error.message}`);
  }
}

/**
 * Retrieve account details for a Duo account
 * @param {string} accountId - Duo account ID
 * @returns {Promise<object>} - Account details
 */
async function getAccountDetails(accountId) {
  try {
    const response = await makeDuoRequest(
      'GET',
      `/accounts/v1/account/${accountId}`
    );

    return response;
  } catch (error) {
    console.error('Error retrieving account details:', error);
    throw new Error(`Failed to retrieve account details: ${error.message}`);
  }
}

/**
 * Create an administrator account in a Duo child account
 * @param {string} accountId - Duo account ID
 * @param {string} apiHostname - Child account API hostname
 * @param {string} email - Admin email address
 * @returns {Promise<object>} - Created admin details
 */
async function createDuoAdministrator(accountId, apiHostname, email) {
  console.log('\n[DUO API CALL] ═════════════════════════════════════════════');
  console.log(`[DUO API CALL] Function: createDuoAdministrator`);
  console.log(`[DUO API CALL] Account ID: ${accountId}`);
  console.log(`[DUO API CALL] API Hostname: ${apiHostname}`);
  console.log(`[DUO API CALL] Email: ${email}`);
  console.log('[DUO API CALL] Endpoint: POST /admin/v1/admins');
  
  try {
    const body = {
      email: email,
      role: 'Owner'  // Full admin access
    };

    const path = `/admin/v1/admins`;

    const response = await makeDuoRequest(
      'POST',
      path,
      body,
      apiHostname  // Use child account hostname
    );

    console.log(`[DUO API CALL] ✅ SUCCESS - Admin created: ${email}`);
    console.log('[DUO API CALL] ═════════════════════════════════════════════\n');
    
    return response;
  } catch (error) {
    console.error(`[DUO API CALL] ❌ FAILED`);
    console.error(`[DUO API CALL] Error: ${error.message}`);
    console.log('[DUO API CALL] ═════════════════════════════════════════════\n');
    throw new Error(`Failed to create administrator: ${error.message}`);
  }
}

/**
 * Set the Duo edition for a child account
 * @param {string} accountId - Duo account ID
 * @param {string} apiHostname - Child account API hostname
 * @param {string} edition - Edition tier: ENTERPRISE, PLATFORM, or BEYOND
 * @returns {Promise<object>} - Response
 */
async function setEdition(accountId, apiHostname, edition) {
  console.log('\n[DUO API CALL] ═════════════════════════════════════════════');
  console.log(`[DUO API CALL] Function: setEdition`);
  console.log(`[DUO API CALL] Account ID: ${accountId}`);
  console.log(`[DUO API CALL] API Hostname: ${apiHostname}`);
  console.log(`[DUO API CALL] Edition: ${edition}`);
  console.log('[DUO API CALL] Endpoint: POST /admin/v1/billing/edition');
  
  try {
    const body = {
      account_id: accountId,
      edition: edition  // ENTERPRISE, PLATFORM, or BEYOND
    };

    const path = `/admin/v1/billing/edition`;

    const response = await makeDuoRequest(
      'POST',
      path,
      body,
      apiHostname  // Use child account hostname
    );

    console.log(`[DUO API CALL] ✅ SUCCESS - Edition set to ${edition}`);
    console.log('[DUO API CALL] ═════════════════════════════════════════════\n');
    
    return response;
  } catch (error) {
    console.error(`[DUO API CALL] ❌ FAILED`);
    console.error(`[DUO API CALL] Error: ${error.message}`);
    console.log('[DUO API CALL] ═════════════════════════════════════════════\n');
    throw new Error(`Failed to set edition: ${error.message}`);
  }
}

/**
 * Delete a Duo child account (for rollback on failed setup)
 * @param {string} accountId - Duo account ID to delete
 * @returns {Promise<object>} - Response
 */
async function deleteAccount(accountId) {
  try {
    console.log(`[Duo API] Deleting account: ${accountId}`);

    const body = {
      account_id: accountId
    };

    const response = await makeDuoRequest(
      'POST',
      '/accounts/v1/account/delete',
      body
    );

    console.log(`[Duo API] Account deleted: ${accountId}`);
    return response;
  } catch (error) {
    console.error('Error deleting account:', error);
    throw new Error(`Failed to delete Duo account: ${error.message}`);
  }
}

/**
 * List all Duo child accounts (Accounts API)
 * @returns {Promise<array>} - List of all accounts
 */
async function listAllAccounts() {
  console.log('\n[DUO API CALL] ═════════════════════════════════════════════');
  console.log(`[DUO API CALL] Function: listAllAccounts`);
  console.log('[DUO API CALL] Endpoint: POST /accounts/v1/account/list');
  
  try {
    const response = await makeDuoRequest(
      'POST',
      '/accounts/v1/account/list',
      {}  // No body parameters needed
    );

    console.log(`[DUO API CALL] ✅ SUCCESS - Found ${response.length} account(s)`);
    console.log('[DUO API CALL] Accounts:');
    response.forEach((account, index) => {
      console.log(`[DUO API CALL]   ${index + 1}. Name: "${account.name}" | ID: ${account.account_id} | Host: ${account.api_hostname}`);
    });
    console.log('[DUO API CALL] ═════════════════════════════════════════════\n');
    
    return response;
  } catch (error) {
    console.error(`[DUO API CALL] ❌ FAILED`);
    console.error(`[DUO API CALL] Error: ${error.message}`);
    console.log('[DUO API CALL] ═════════════════════════════════════════════\n');
    throw new Error(`Failed to list accounts: ${error.message}`);
  }
}

module.exports = {
  createDuoAccount,
  updateHardUserLimit,
  getAccountDetails,
  createDuoAdministrator,
  setEdition,
  deleteAccount,
  listAllAccounts,
  generateDuoHeaders
};
