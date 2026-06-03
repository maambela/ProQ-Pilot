const axios = require('axios');

let tokenCache = {
  accessToken: null,
  expiresAt: 0
};

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

function hasWestconConfig() {
  return Boolean(
    process.env.WESTCON_CLIENT_ID &&
    process.env.WESTCON_CLIENT_SECRET &&
    process.env.WESTCON_RESOURCE_ID &&
    process.env.WESTCON_OAUTH_URL &&
    process.env.WESTCON_SUBSCRIPTION_KEY &&
    process.env.WESTCON_API_BASE_URL &&
    process.env.WESTCON_MICROSOFT_LICENSES_PATH
  );
}

async function getAccessToken() {
  if (!hasWestconConfig()) {
    throw new Error('Westcon Microsoft API credentials are incomplete');
  }

  if (tokenCache.accessToken && tokenCache.expiresAt > Date.now() + 60000) {
    return tokenCache.accessToken;
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: requireEnv('WESTCON_CLIENT_ID'),
    client_secret: requireEnv('WESTCON_CLIENT_SECRET'),
    resource: requireEnv('WESTCON_RESOURCE_ID')
  });

  const response = await axios.post(requireEnv('WESTCON_OAUTH_URL'), body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 20000
  });

  if (!response.data?.access_token) {
    throw new Error('Westcon OAuth response did not include an access token');
  }

  tokenCache = {
    accessToken: response.data.access_token,
    expiresAt: Date.now() + ((response.data.expires_in || 3300) * 1000)
  };

  return tokenCache.accessToken;
}

function westconHeaders(token) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'Ocp-Apim-Subscription-Key': requireEnv('WESTCON_SUBSCRIPTION_KEY')
  };

  if (process.env.WESTCON_API_KEY) {
    headers.API_KEY = process.env.WESTCON_API_KEY;
  }

  return headers;
}

function getResultData(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.result?.data)) return payload.result.data;
  if (Array.isArray(payload?.result?.items)) return payload.result.items;
  if (Array.isArray(payload?.result)) return payload.result;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.value)) return payload.value;
  return [];
}

function inferCategory(item, name) {
  const text = `${name} ${item.category || ''} ${item.productType || ''} ${item.status || ''}`.toLowerCase();
  if (/defender|intune|entra|security|premium/.test(text)) return 'security';
  if (/teams|meeting|voice/.test(text)) return 'collaboration';
  if (/exchange|email|mail/.test(text)) return 'email';
  return 'productivity';
}

function firstValue(source, keys, fallback = '') {
  for (const key of keys) {
    if (source && source[key] !== undefined && source[key] !== null && source[key] !== '') {
      return source[key];
    }
  }
  return fallback;
}

function normalizeProduct(row, product, index) {
  const name = firstValue(product, [
    'productName',
    'product_name',
    'name',
    'productDescription',
    'description',
    'sku',
    'productNumber'
  ], 'Microsoft License');
  const sku = firstValue(product, [
    'productNumber',
    'sku',
    'skuId',
    'productSku',
    'productCode',
    'id'
  ], `${firstValue(row, ['customerId', 'customerID'], 'customer')}-${index}`);
  const assigned = Number(firstValue(product, ['assigned', 'assignedLicenses', 'consumedUnits', 'used', 'usedLicenses'], 0));
  const available = Number(firstValue(product, ['available', 'availableLicenses', 'enabled', 'total', 'totalLicenses'], 0));
  const status = firstValue(product, ['status', 'licenseStatus', 'state'], firstValue(row, ['status'], 'Live'));
  const customerName = firstValue(row, ['customerName', 'customer_name', 'tenantName'], 'Customer');
  const customerId = firstValue(row, ['customerId', 'customerID', 'tenantId'], '');
  const price = Number(firstValue(product, ['price', 'unitPrice', 'customerPrice', 'listPrice'], 0));

  return {
    sku: String(sku),
    name: String(name),
    category: inferCategory(product, name),
    description: [
      customerName ? `Customer: ${customerName}` : '',
      status ? `Status: ${status}` : '',
      assigned ? `Assigned: ${assigned}` : '',
      available ? `Available/total: ${available}` : ''
    ].filter(Boolean).join(' | '),
    billingTerm: firstValue(product, ['billingTerm', 'term', 'commitment'], 'Live report'),
    price,
    tags: [
      customerId && `Customer ${customerId}`,
      status,
      assigned ? `${assigned} assigned` : '',
      available ? `${available} total` : ''
    ].filter(Boolean).slice(0, 3),
    customerName,
    customerId,
    assigned,
    available,
    status,
    source: 'westcon',
    raw: product
  };
}

function normalizeReportRows(rows) {
  const licenses = [];

  rows.forEach((row, rowIndex) => {
    const products = Array.isArray(row.products) ? row.products : [];

    if (products.length) {
      products.forEach((product, productIndex) => {
        licenses.push(normalizeProduct(row, product, `${rowIndex}-${productIndex}`));
      });
      return;
    }

    licenses.push(normalizeProduct(row, row, rowIndex));
  });

  return licenses.filter(item => item.name && item.sku);
}

async function fetchWestconLicenses(options = {}) {
  const token = await getAccessToken();
  const baseUrl = requireEnv('WESTCON_API_BASE_URL');
  const path = requireEnv('WESTCON_MICROSOFT_LICENSES_PATH');
  const url = new URL(path, baseUrl).toString();
  const body = {
    offset: Number(options.offset ?? 0),
    max: Number(options.max ?? process.env.WESTCON_REPORT_MAX ?? 100)
  };

  if (options.yearMonth) body.yearMonth = options.yearMonth;
  if (Array.isArray(options.products) && options.products.length) body.products = options.products;

  let response;
  try {
    response = await axios.post(url, body, {
      headers: westconHeaders(token),
      timeout: 30000
    });
  } catch (error) {
    const status = error.response?.status;
    const detail = error.response?.data
      ? JSON.stringify(error.response.data)
      : error.message;
    throw new Error(`Westcon Microsoft Licenses Report failed${status ? ` (${status})` : ''}: ${detail}`);
  }

  const rows = getResultData(response.data);
  return {
    source: 'westcon',
    request: body,
    totalCount: Number(response.data?.result?.totalCount ?? rows.length),
    licenses: normalizeReportRows(rows)
  };
}

async function listMicrosoftLicenses(options = {}) {
  if (!hasWestconConfig()) {
    throw new Error('Westcon Microsoft API credentials are incomplete');
  }

  const report = await fetchWestconLicenses(options);
  if (!report.licenses.length) {
    throw new Error('Westcon Microsoft Licenses Report returned no license data');
  }

  return report;
}

module.exports = {
  getAccessToken,
  listMicrosoftLicenses
};
