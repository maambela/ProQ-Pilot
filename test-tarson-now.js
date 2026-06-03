require('dotenv').config();
const axios = require('axios');

async function testTarsonNow() {
    console.log('🔍 Testing Tarson API NOW...\n');
    
    const url = process.env.TARSON_API_URL;
    const token = process.env.TARSON_API_TOKEN;
    
    try {
        const response = await axios.get(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000,
            maxContentLength: 50 * 1024 * 1024
        });
        
        console.log(`✅ Response Status: ${response.status}\n`);
        
        const data = response.data;
        const keys = Object.keys(data);
        
        console.log(`📊 Top-level keys (${keys.length}):`);
        keys.forEach(k => {
            const val = data[k];
            if (Array.isArray(val)) {
                console.log(`  - ${k}: [Array with ${val.length} items]`);
                if (val.length > 0 && typeof val[0] === 'object') {
                    const itemKeys = Object.keys(val[0]).slice(0, 8);
                    console.log(`    Sample item keys: ${itemKeys.join(', ')}`);
                }
            } else if (typeof val === 'object') {
                const nestedKeys = Object.keys(val).slice(0, 5);
                console.log(`  - ${k}: {Object with keys: ${nestedKeys.join(', ')}...}`);
            } else {
                console.log(`  - ${k}: ${typeof val} (${String(val).substring(0, 50)}...)`);
            }
        });
        
        // Check for Products array specifically
        console.log('\n🎯 Looking for product data...');
        if (data.Products && Array.isArray(data.Products)) {
            console.log(`✅ FOUND: data.Products is an array with ${data.Products.length} items!\n`);
            
            const firstProduct = data.Products[0];
            console.log('📦 First product structure:');
            console.log(JSON.stringify(firstProduct, null, 2).substring(0, 500));
            
            // Count laptops
            const laptopKeywords = ['laptop', 'macbook', 'notebook', 'mba', 'mbp', 'thinkpad', 'ideapad', 'latitude'];
            const laptops = data.Products.filter(p => {
                const fullText = `${p.name || ''} ${p.description || ''} ${p.category || ''}`.toLowerCase();
                return laptopKeywords.some(kw => fullText.includes(kw));
            });
            
            console.log(`\n💻 Laptop count: ${laptops.length} out of ${data.Products.length}`);
            
            if (laptops.length > 0) {
                console.log('\nSample laptops:');
                laptops.slice(0, 3).forEach((p, i) => {
                    console.log(`  ${i + 1}. ${p.name || p.product_name || 'N/A'}`);
                    console.log(`     Price: ${p.price || p.selling_price || 'N/A'}`);
                    console.log(`     Brand: ${p.brand || 'N/A'}`);
                });
            }
        } else {
            console.log('❌ No Products array found');
        }
        
    } catch (error) {
        console.log(`❌ Error: ${error.message}`);
        if (error.response?.status) {
            console.log(`Status: ${error.response.status}`);
            console.log(`Response: ${JSON.stringify(error.response.data)}`);
        }
    }
}

testTarsonNow();
