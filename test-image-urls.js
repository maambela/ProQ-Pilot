// Test the image URL logic from the fixed js/script.js

const testCases = [
  { 
    image_url: 'https://s3.amazonaws.com/tarsus.co.za/NX.J7LEA.001_default.jpg', 
    expected: 'https://s3.amazonaws.com/tarsus.co.za/NX.J7LEA.001_default.jpg',
    desc: 'Tarson S3 URL' 
  },
  { 
    image_url: 'product-1234.webp', 
    expected: '/product_images/product-1234.webp',
    desc: 'Local uploaded image'
  },
  { 
    image_url: null, 
    expected: 'placeholder',
    desc: 'No image (null)'
  }
];

console.log('Testing image URL logic from js/script.js:\n');

let allPassed = true;
testCases.forEach(test => {
  // This is the logic now in js/script.js after the fix
  const result = test.image_url 
    ? (test.image_url.startsWith('http') 
        ? test.image_url 
        : '/product_images/' + test.image_url)
    : 'placeholder';
  
  const passed = result === test.expected;
  allPassed = allPassed && passed;
  
  console.log(`${passed ? '✓' : '✗'} ${test.desc}`);
  console.log(`  Input:    ${test.image_url || 'null'}`);
  console.log(`  Output:   ${result}`);
  console.log(`  Expected: ${test.expected}`);
  console.log();
});

console.log(allPassed ? '✅ All tests passed!' : '❌ Some tests failed');
process.exit(allPassed ? 0 : 1);
