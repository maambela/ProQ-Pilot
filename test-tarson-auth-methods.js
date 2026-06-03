require('dotenv').config();
const axios = require('axios');
const https = require('https');

async function testAllAuthMethods() {
    const url = process.env.TARSON_API_URL;
    const token = process.env.TARSON_API_TOKEN;
    
    console.log('===== TARSON API AUTHENTICATION DIAGNOSTIC =====\n');
    console.log(`URL: ${url}`);
    console.log(`Token: ${token.substring(0, 20)}...\n`);
    
    const httpsAgent = new https.Agent({ rejectUnauthorized: false });
    
    const methods = [
        {
            name: 'No authentication',
            fn: () => axios.get(url, { httpsAgent, timeout: 10000 })
        },
        {
            name: 'Bearer token (header)',
            fn: () => axios.get(url, {
                headers: { 'Authorization': `Bearer ${token}` },
                httpsAgent,
                timeout: 10000
            })
        },
        {
            name: 'Plain API key header',
            fn: () => axios.get(url, {
                headers: { 'X-API-Key': token },
                httpsAgent,
                timeout: 10000
            })
        },
        {
            name: 'Token in Authorization header (no Bearer)',
            fn: () => axios.get(url, {
                headers: { 'Authorization': token },
                httpsAgent,
                timeout: 10000
            })
        },
        {
            name: 'api_key query param',
            fn: () => axios.get(`${url}?api_key=${token}`, {
                httpsAgent,
                timeout: 10000
            })
        },
        {
            name: 'token query param',
            fn: () => axios.get(`${url}?token=${token}`, {
                httpsAgent,
                timeout: 10000
            })
        },
        {
            name: 'auth query param',
            fn: () => axios.get(`${url}?auth=${token}`, {
                httpsAgent,
                timeout: 10000
            })
        },
        {
            name: 'Empty bearer token (test connectivity)',
            fn: () => axios.get(url, {
                headers: { 'Authorization': 'Bearer ' },
                httpsAgent,
                timeout: 10000
            })
        }
    ];
    
    for (const method of methods) {
        try {
            process.stdout.write(`Testing: ${method.name}... `);
            const response = await method.fn();
            
            console.log(`✅ SUCCESS (${response.status})`);
            
            // Show response details
            if (response.status === 200) {
                const dataSize = JSON.stringify(response.data).length;
                console.log(`   Data size: ${(dataSize / 1024 / 1024).toFixed(2)}MB`);
                
                if (typeof response.data === 'object') {
                    const keys = Object.keys(response.data);
                    console.log(`   Top keys: ${keys.slice(0, 5).join(', ')}`);
                    
                    // Check for product data
                    for (const key of keys) {
                        if (key.toLowerCase().includes('product') || key.toLowerCase().includes('item') || key.toLowerCase().includes('data')) {
                            if (Array.isArray(response.data[key])) {
                                console.log(`   ✓ FOUND PRODUCTS AT .${key}: ${response.data[key].length} items!`);
                            }
                        }
                    }
                }
            } else if (response.status === 403) {
                console.log(`   (Rate limited - try again in a moment)`);
            } else if (response.status === 401) {
                console.log(`   (Unauthorized)`);
            }
            
        } catch (error) {
            const status = error.response?.status;
            const message = error.response?.statusText || error.code || error.message;
            console.log(`❌ ${status ? `${status}` : message}`);
        }
    }
    
    console.log('\n===== DIAGNOSTIC COMPLETE =====');
    console.log('\n💡 NEXT STEPS:');
    console.log('1. If any method returned 200 OK, note which one');
    console.log('2. If all return 403, the API may have rate limiting - wait 5+ minutes');
    console.log('3. If all return 401/similar, the token may need updating');
    console.log('4. Check with Tarson if the endpoint URL or auth method has changed');
}

testAllAuthMethods().catch(console.error);
