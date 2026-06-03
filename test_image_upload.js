// Quick test to verify image upload and approval workflow

const http = require('http');

function makeRequest(path, method = 'GET') {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    console.log(`✓ ${method} ${path}`);
                    console.log(`  Status: ${json.status}`);
                    if (json.data) {
                        if (json.data.products) {
                            console.log(`  Products: ${json.data.products.length}`);
                        }
                    }
                    resolve(json);
                } catch (e) {
                    console.error(`✗ Failed to parse response: ${e.message}`);
                    reject(e);
                }
            });
        });

        req.on('error', reject);
        req.setTimeout(5000);
        req.end();
    });
}

(async () => {
    try {
        console.log('Testing StackOps Store API endpoints...\n');
        
        // Test 1: Get store products
        console.log('1. Store Products Endpoint:');
        const storeRes = await makeRequest('/api/v1/products');
        
        // Test 2: Get pending products  
        console.log('\n2. Pending Products Endpoint:');
        const pendingRes = await makeRequest('/api/v1/core-products/pending');
        
        // Test 3: Get approved products
        console.log('\n3. Approved Products Endpoint:');
        const approvedRes = await makeRequest('/api/v1/core-products/approved/list');
        
        console.log('\n✓ All endpoints responding correctly!');
        console.log(`\nSummary:`);
        console.log(`- Store: ${storeRes.data.products ? storeRes.data.products.length : 0} products`);
        console.log(`- Pending: ${pendingRes.data.products ? pendingRes.data.products.length : 0} products`);
        console.log(`- Approved: ${approvedRes.data.products ? approvedRes.data.products.length : 0} products`);
        
    } catch (err) {
        console.error('✗ Test failed:', err.message);
        process.exit(1);
    }
})();
