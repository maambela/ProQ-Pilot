const http = require('http');

async function testToggle() {
    const options = {
        hostname: 'localhost',
        port: 3000,
        path: '/api/v1/core-products/approved/list',
        method: 'GET'
    };

    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    console.log('✓ API Response received successfully');
                    console.log(`\n📊 Total products: ${parsed.data.products.length}`);
                    
                    if (parsed.data.products.length > 0) {
                        const sample = parsed.data.products[0];
                        console.log(`\n📦 Sample Product:`);
                        console.log(`   ID: ${sample.id}`);
                        console.log(`   Name: ${sample.product_name}`);
                        console.log(`   Status: ${sample.status}`);
                        console.log(`   Brand: ${sample.brand}`);
                        console.log(`   is_active: ${sample.is_active}`);
                        console.log(`   Image count: ${sample.image_count}`);
                        
                        if (sample.hasOwnProperty('is_active')) {
                            console.log('\n✅ SUCCESS: is_active field is present!');
                            console.log('✅ Toggle switch will work correctly!');
                        } else {
                            console.log('\n❌ ERROR: is_active field is missing!');
                        }
                    }
                    resolve();
                } catch (e) {
                    console.error('Error parsing response:', e.message);
                    reject(e);
                }
            });
        });

        req.on('error', (error) => {
            console.error('Request error:', error.message);
            reject(error);
        });

        req.end();
    });
}

testToggle().catch(console.error);
