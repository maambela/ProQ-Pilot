// Test script to verify Tarson Online integration
// Run this in your browser console or via curl

// 1. Manual sync test (run in browser console:)
console.log('Testing Tarson sync...');
fetch('/api/v1/sync-tarson', { method: 'POST' })
    .then(res => res.json())
    .then(data => console.log('Sync Response:', data))
    .catch(err => console.error('Sync Error:', err));

// 2. Check Tarson status
console.log('Checking Tarson status...');
fetch('/api/v1/tarson-status')
    .then(res => res.json())
    .then(data => {
        console.log('Tarson Status:', data);
        if (data.data.stats.total_products > 0) {
            console.log(`✓ Found ${data.data.stats.total_products} laptops`);
            console.log(`✓ ${data.data.stats.active_products} are active`);
            console.log(`✓ ${data.data.stats.in_stock} in stock`);
        } else {
            console.log('✗ No laptops found yet');
        }
    })
    .catch(err => console.error('Status Error:', err));

// 3. Get all store products (should include Tarson)
console.log('Fetching store products...');
fetch('/api/v1/products')
    .then(res => res.json())
    .then(data => {
        console.log(`✓ Store has ${data.results} total products`);
        
        // Show product brands
        const brands = {};
        data.data.products.forEach(p => {
            brands[p.brand] = (brands[p.brand] || 0) + 1;
        });
        console.log('Products by brand:', brands);
        
        // Show Tarson products specifically
        const tarsonBrands = ['DELL', 'LENOVO', 'HP', 'ASUS', 'ACER', 'MSI'];
        const tarsonProds = data.data.products.filter(p => tarsonBrands.includes(p.brand));
        console.log(`\n✓ Found ${tarsonProds.length} Tarson laptops:`, tarsonProds.slice(0, 3));
    })
    .catch(err => console.error('Products Error:', err));

// 4. Check server logs for:
// [TARSON API] Fetching products...
// [TARSON API] Fetched X total products
// [TARSON] Starting sync with laptop-only filter...
// [TARSON] Filtered to X laptops from Y total products
// [TARSON] Sync completed - X new laptops added
