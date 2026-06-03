require('dotenv').config();
const axios = require('axios');

// Copy of getTarsonProducts with retry logic  
async function getTarsonProducts() {
    const MAX_RETRIES = 3;
    const BASE_DELAY = 5000; // 5 seconds
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const tarsonUrl = process.env.TARSON_API_URL;
            const tarsonToken = process.env.TARSON_API_TOKEN;
            
            if (!tarsonUrl || !tarsonToken) {
                throw new Error('TARSON_API_URL or TARSON_API_TOKEN not configured in .env');
            }
            
            console.log(`\n[TARSON API] Attempt ${attempt}/${MAX_RETRIES}: Fetching products...`);
            
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
            
            console.log(`[TARSON API] Response status: ${response.status}`);
            
            // Handle different response status codes
            if (response.status === 403) {
                const delayMs = BASE_DELAY * Math.pow(2, attempt - 1);
                if (attempt < MAX_RETRIES) {
                    console.warn(`[TARSON API] Rate limited (403). Waiting ${delayMs}ms before retry...`);
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                    continue;
                } else {
                    console.error("[TARSON API] Rate limited after 3 attempts. Giving up.");
                    return [];
                }
            }
            
            if (response.status !== 200) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            // Parse response
            const data = response.data;
            console.log(`[TARSON API] Got response, parsing for products...`);
            console.log(`[TARSON API] Response type: ${typeof data}`);
            console.log(`[TARSON API] Is array: ${Array.isArray(data)}`);
            if (typeof data === 'object') {
                console.log(`[TARSON API] Object keys: ${Object.keys(data).slice(0, 10).join(', ')}`);
            }
            
            // Try multiple paths
            let items = [];
            
            if (Array.isArray(data)) {
                items = data;
                console.log(`[TARSON API] ✓ Found products at root level: ${items.length} items`);
            } else if (data.products && Array.isArray(data.products)) {
                items = data.products;
                console.log(`[TARSON API] ✓ Found products at .products: ${items.length} items`);
            } else if (data.data && Array.isArray(data.data)) {
                items = data.data;
                console.log(`[TARSON API] ✓ Found products at .data: ${items.length} items`);
            } else if (data.result && Array.isArray(data.result)) {
                items = data.result;
                console.log(`[TARSON API] ✓ Found products at .result: ${items.length} items`);
            } else if (data.ProductCatalogue && Array.isArray(data.ProductCatalogue)) {
                items = data.ProductCatalogue;
                console.log(`[TARSON API] ✓ Found products at .ProductCatalogue: ${items.length} items`);
            } else if (data.items && Array.isArray(data.items)) {
                items = data.items;
                console.log(`[TARSON API] ✓ Found products at .items: ${items.length} items`);
            } else if (typeof data === 'object') {
                // Search for product arrays
                console.log(`[TARSON API] Searching nested properties...`);
                for (const [key, value] of Object.entries(data)) {
                    if (Array.isArray(value) && value.length > 0) {
                        const firstItem = value[0];
                        if (typeof firstItem === 'object' && (
                            firstItem.name || firstItem.product_name || firstItem.title ||
                            firstItem.price || firstItem.sku || firstItem.category
                        )) {
                            items = value;
                            console.log(`[TARSON API] ✓ Found products at .${key}: ${items.length} items`);
                            console.log(`[TARSON API] Sample item keys: ${Object.keys(firstItem).slice(0, 8).join(', ')}`);
                            break;
                        }
                    }
                }
            }
            
            if (items.length === 0) {
                console.warn(`[TARSON API] ⚠️  No product arrays found in response`);
                // Show all keys at top level
                if (typeof data === 'object') {
                    const allKeys = Object.keys(data);
                    console.log(`[TARSON API] All top-level keys (${allKeys.length}): ${allKeys.join(', ')}`);
                }
            }
            
            console.log(`[TARSON API] ✅ Extracted ${items.length} total products\n`);
            return items || [];
            
        } catch (error) {
            console.error(`[TARSON API] Attempt ${attempt} failed: ${error.message}`);
            
            if (attempt === MAX_RETRIES) {
                if (error.response?.status === 403) {
                    console.error("[TARSON API] Rate limit persists after retries.");
                } else if (error.code === 'ENOTFOUND') {
                    console.error("[TARSON API] DNS resolution failed - check URL");
                }
                return [];
            }
            
            // Wait before retry
            const delayMs = BASE_DELAY * Math.pow(2, attempt - 1);
            console.log(`[TARSON API] Retrying in ${delayMs}ms...\n`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
    
    return [];
}

// Run the test
(async () => {
    console.log('=' .repeat(70));
    console.log('TESTING TARSON API FETCH WITH RETRY LOGIC');
    console.log('=' .repeat(70));
    
    const products = await getTarsonProducts();
    
    console.log('\n' + '=' .repeat(70));
    console.log(`RESULT: ${products.length} products fetched`);
    console.log('=' .repeat(70));
    
    if (products.length > 0) {
        console.log('\n🎉 SUCCESS! Sample of first 3 products:');
        products.slice(0, 3).forEach((p, i) => {
            console.log(`\n  Product ${i + 1}:`);
            console.log(`    Name: ${p.name || p.product_name || p.title || 'N/A'}`);
            console.log(`    Price: ${p.price || p.selling_price || 'N/A'}`);
            console.log(`    Qty: ${p.quantity || p.stock || 'N/A'}`);
            console.log(`    Category: ${p.category || p.cat || 'N/A'}`);
        });
    } else {
        console.log('\n❌ No products fetched - check API status and retry');
    }
})();
