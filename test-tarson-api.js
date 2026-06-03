const axios = require('axios');
const https = require('https');

async function testTarsonAPI() {
    const tarsonUrl = 'https://feedgen.tarsusonline.co.za/api/DataFeed/Customer-ProductCatalogue';
    const tarsonToken = 'b90c2Febe2d94688a704644ca99e9F92_7da662d49cF04c1da7f8c986f5Fe0df8';
    
    console.log('=' .repeat(70));
    console.log('TARSON API DETAILED DEBUG TEST');
    console.log('=' .repeat(70));
    console.log(`URL: ${tarsonUrl}`);
    console.log(`Token: ${tarsonToken.substring(0, 20)}...`);
    console.log();
    
    // Create axios instance with no SSL verification (for debugging only)
    const axiosInstance = axios.create({
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
        validateStatus: () => true  // Don't throw on any status code
    });
    
    try {
        console.log('🔄 Sending request with standard headers + User-Agent...\n');
        
        const response = await axiosInstance.get(tarsonUrl, {
            headers: {
                'Authorization': `Bearer ${tarsonToken}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json, application/xml, text/plain, */*',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'no-cache'
            },
            timeout: 20000
        });
        
        console.log(`📊 Response Status: ${response.status}`);
        console.log(`📋 Response Headers:`);
        Object.entries(response.headers).forEach(([key, val]) => {
            if (key.toLowerCase() !== 'set-cookie') {
                console.log(`   ${key}: ${String(val).substring(0, 100)}`);
            }
        });
        console.log();
        
        const contentType = response.headers['content-type'] || '';
        
        // Handle response data - might already be parsed JSON
        let dataStr;
        if (typeof response.data === 'string') {
            dataStr = response.data;
        } else {
            // It's already an object, convert to JSON
            dataStr = JSON.stringify(response.data);
        }
        
        console.log(`📝 Response Type: ${contentType}`);
        console.log(`📦 Response Size: ${dataStr.length} bytes\n`);
        
        // Show first 2000 characters
        console.log('📄 RESPONSE CONTENT (first 2000 chars):');
        console.log('-'.repeat(70));
        console.log(dataStr.substring(0, 2000));
        console.log('-'.repeat(70));
        console.log();
        
        // Parse as JSON
        let json;
        if (typeof response.data === 'object') {
            json = response.data;
            console.log('✅ Response is already parsed JSON object!');
        } else {
            try {
                json = JSON.parse(dataStr);
                console.log('✅ Successfully parsed JSON!');
            } catch (e) {
                console.log('❌ Failed to parse JSON:', e.message);
                return;
            }
        }
        
        console.log('Top-level keys:', Object.keys(json).slice(0, 20).join(', '));
        console.log();
        
        // Check for products in various locations
        if (json.products) console.log('✓ Found .products:', Array.isArray(json.products) ? `Array with ${json.products.length} items` : `Object`);
        if (json.data) console.log('✓ Found .data:', Array.isArray(json.data) ? `Array with ${json.data.length} items` : `Object`);
        if (json.result) console.log('✓ Found .result:', typeof json.result);
        if (json.ProductCatalogue) console.log('✓ Found .ProductCatalogue:', typeof json.ProductCatalogue);
        if (json.items) console.log('✓ Found .items:', typeof json.items);
        if (Array.isArray(json) && json.length > 0) console.log('✓ Root is array with', json.length, 'items');
        
        // Search for any property that looks like it contains products
        console.log('\n🔍 Searching for product data in nested properties...');
        function findProductArrays(obj, prefix = '', depth = 0) {
            if (depth > 3) return;
            if (!obj || typeof obj !== 'object') return;
            
            Object.entries(obj).forEach(([key, value]) => {
                const keyLower = key.toLowerCase();
                if (keyLower.includes('product') || keyLower.includes('item') || keyLower.includes('catalog') || keyLower.includes('feed') || keyLower.includes('data')) {
                    if (Array.isArray(value)) {
                        console.log(`  ✓ Array at "${prefix}${key}": ${value.length} items`);
                        if (value.length > 0 && typeof value[0] === 'object') {
                            const keys = Object.keys(value[0]).slice(0, 8);
                            console.log(`    Sample keys: ${keys.join(', ')}`);
                        }
                    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                        const keys = Object.keys(value).slice(0, 5);
                        console.log(`  ○ Object at "${prefix}${key}", keys: ${keys.join(', ')}`);
                    }
                }
                
                if (typeof value === 'object' && value !== null && depth < 2) {
                    findProductArrays(value, `${prefix}${key}.`, depth + 1);
                }
            });
        }
        findProductArrays(json);
        
    } catch (error) {
        console.error('❌ Request failed:', error.message);
    }
}

testTarsonAPI();
