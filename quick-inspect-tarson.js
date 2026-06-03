require('dotenv').config();
const axios = require('axios');

(async () => {
    try {
        console.log('[START] Fetching Tarson products...');
        
        const response = await axios.get(process.env.TARSON_API_URL, {
            headers: {
                'Authorization': `Bearer ${process.env.TARSON_API_TOKEN}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000,
            maxContentLength: 50 * 1024 * 1024
        });
        
        const data = response.data;
        console.log('[DATA] Response received, checking for products...');
        
        if (data.Products && Array.isArray(data.Products)) {
            console.log(`[FOUND] ${data.Products.length} products in .Products array`);
            
            if (data.Products.length > 0) {
                const first = data.Products[0];
                console.log('\n[FIRST PRODUCT STRUCTURE]');
                console.log('Fields:', Object.keys(first));
                console.log('\n[FIRST PRODUCT JSON]');
                console.log(JSON.stringify(first, null, 2));
                
                // Check for laptop patterns
                console.log('\n[SEARCHING FOR LAPTOPS]');
                let found = 0;
                data.Products.forEach((p, i) => {
                    const allText = JSON.stringify(p).toLowerCase();
                    if (allText.includes('laptop') || allText.includes('notebook')) {
                        found++;
                        if (found <= 3) {
                            console.log(`\nLaptop ${found} (index ${i}):`);
                            console.log(JSON.stringify(p, null, 2));
                        }
                    }
                });
                console.log(`\n[TOTAL LAPTOPS FOUND]: ${found}`);
            }
        } else {
            console.log('[ERROR] No .Products array found');
            console.log('[Response keys]:', Object.keys(data).slice(0, 10));
        }
        
        process.exit(0);
    } catch (err) {
        console.error('[ERROR]', err.message);
        if (err.response) {
            console.error('[Status]', err.response.status);
            console.error('[Data]', JSON.stringify(err.response.data).substring(0, 500));
        }
        process.exit(1);
    }
})();
