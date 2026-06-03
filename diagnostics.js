// Diagnostic test for store products

console.log('=== StackOps Store Diagnostics ===\n');

// Check if .product-grid exists
const gridElement = document.querySelector('.product-grid');
console.log('1. Product grid element found:', gridElement ? 'YES' : 'NO');

// Check if we can fetch from API
fetch('/api/v1/products?t=' + Date.now())
    .then(res => {
        console.log('2. API Response Status:', res.status, res.statusText);
        return res.json();
    })
    .then(data => {
        console.log('3. API Response Structure:');
        console.log('   - status:', data.status);
        console.log('   - data exists:', !!data.data);
        console.log('   - products array:', Array.isArray(data.data?.products));
        console.log('   - products count:', data.data?.products?.length || 0);
        
        if (data.data?.products?.length > 0) {
            const first = data.data.products[0];
            console.log('\n4. First Product Sample:');
            console.log('   - id:', first.id);
            console.log('   - name:', first.product_name?.substring(0, 40));
            console.log('   - status:', first.status);
            console.log('   - image_url:', first.image_url);
        }
    })
    .catch(err => {
        console.error('API Fetch Error:', err.message);
    });

// Test image upload to pending product
async function testImageUpload() {
    try {
        // Get first pending product
        const pendingRes = await fetch('/api/v1/core-products/pending');
        const pendingData = await pendingRes.json();
        
        if (pendingData.data?.products?.length === 0) {
            console.log('\n5. No pending products available for image test');
            return;
        }
        
        const testProductId = pendingData.data.products[0].id;
        console.log('\n5. Testing image upload on Product ID:', testProductId);
        
        // Create a test image (1x1 pixel transparent PNG)
        const pngData = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
        const binaryString = atob(pngData);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'image/png' });
        
        const formData = new FormData();
        formData.append('images', blob, 'test.png');
        
        const uploadRes = await fetch(`/api/v1/core-products/${testProductId}/images`, {
            method: 'POST',
            body: formData
        });
        
        const uploadData = await uploadRes.json();
        console.log('   - Upload status:', uploadRes.status);
        console.log('   - Upload response:', uploadData);
        
    } catch (err) {
        console.error('Image upload test error:', err);
    }
}

setTimeout(testImageUpload, 500);
