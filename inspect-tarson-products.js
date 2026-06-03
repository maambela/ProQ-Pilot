require('dotenv').config();
const axios = require('axios');

async function inspectTarsonProducts() {
    console.log('🔍 Inspecting Tarson product structure...\n');
    
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
        
        const data = response.data;
        
        if (data.Products && Array.isArray(data.Products) && data.Products.length > 0) {
            console.log(`✅ Found ${data.Products.length} products\n`);
            
            // Show first 5 products structure
            console.log('📦 First 5 products structure:');
            console.log('—'.repeat(80));
            
            data.Products.slice(0, 5).forEach((product, idx) => {
                console.log(`\nProduct ${idx + 1}:`);
                console.log(JSON.stringify(product, null, 2).substring(0, 800));
                console.log('...(truncated)');
            });
            
            // Analyze field names
            console.log('\n' + '='.repeat(80));
            console.log('📊 FIELD ANALYSIS:');
            console.log('='.repeat(80));
            
            const firstProduct = data.Products[0];
            const fields = Object.keys(firstProduct);
            
            console.log(`\nAll fields in first product (${fields.length} total):`);
            fields.forEach(f => {
                const val = firstProduct[f];
                const type = typeof val;
                const preview = type === 'string' ? val.substring(0, 40) : String(val).substring(0, 40);
                console.log(`  • ${f}: ${type} = "${preview}"`);
            });
            
            // Find likely laptop name/description fields
            console.log('\n🎯 LIKELY NAME/DESCRIPTION FIELDS:');
            ['name', 'title', 'productName', 'product_name', 'description', 'desc', 'category', 'cat', 'brand', 'type', 'productType'].forEach(field => {
                if (firstProduct[field]) {
                    console.log(`  ✓ ${field}: "${String(firstProduct[field]).substring(0, 60)}..."`);
                }
            });
            
            // Search for laptops in products
            console.log('\n🔍 SEARCHING FOR LAPTOPS:');
            const laptopKeywords = ['laptop', 'macbook', 'notebook', 'mba', 'mbp', 'thinkpad', 'ideapad', 'latitude'];
            
            let laptopsFound = [];
            data.Products.forEach((p, idx) => {
                // Check all string fields for laptop keywords
                const allText = Object.values(p)
                    .filter(v => typeof v === 'string')
                    .join(' ')
                    .toLowerCase();
                
                if (laptopKeywords.some(kw => allText.includes(kw))) {
                    laptopsFound.push({ idx, product: p });
                }
            });
            
            console.log(`Found ${laptopsFound.length} laptop products`);
            
            if (laptopsFound.length > 0) {
                console.log('\nFirst 3 laptops found:');
                laptopsFound.slice(0, 3).forEach((item, idx) => {
                    const p = item.product;
                    console.log(`  ${idx + 1}. Index ${item.idx}:`);
                    const name = p.name || p.productName || p.title || 'N/A';
                    const desc = p.description || p.desc || 'N/A';
                    const price = p.price || p.selling_price || 'N/A';
                    console.log(`     Name: ${String(name).substring(0, 50)}`);
                    console.log(`     Description: ${String(desc).substring(0, 50)}`);
                    console.log(`     Price: ${price}`);
                });
            } else {
                console.log('\n⚠️  No laptops found with current keywords!');
                console.log('Trying to find products with "computer" or "device" keywords...');
                
                let computerProducts = [];
                data.Products.forEach((p, idx) => {
                    const allText = Object.values(p)
                        .filter(v => typeof v === 'string')
                        .join(' ')
                        .toLowerCase();
                    
                    if (allText.includes('computer') || allText.includes('device') || allText.includes('pc')) {
                        computerProducts.push({ idx, product: p });
                    }
                });
                
                console.log(`Found ${computerProducts.length} computer/device products`);
                if (computerProducts.length > 0) {
                    console.log('\nFirst computer product:');
                    const p = computerProducts[0].product;
                    console.log(JSON.stringify(p, null, 2).substring(0, 600));
                }
            }
        }
        
    } catch (error) {
        console.error(`❌ Error: ${error.message}`);
    }
}

inspectTarsonProducts();
