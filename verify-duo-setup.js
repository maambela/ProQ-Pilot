#!/usr/bin/env node

/**
 * Duo System Setup Verification Script
 * Checks all components are configured correctly
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

console.log('\n🔍 Duo License System - Verification Checklist\n');

let allGood = true;

// 1. Check .env variables
console.log('1️⃣  Environment Variables:');
const required = ['DUO_IKEY', 'DUO_SKEY', 'DUO_HOST'];
required.forEach(key => {
  const value = process.env[key];
  if (value && value !== 'DIBCFGUMGGDNY5Y9WWGU' && !value.includes('XXXX')) {
    console.log(`   ✅ ${key} is set`);
  } else {
    console.log(`   ❌ ${key} is missing or placeholder`);
    allGood = false;
  }
});

// 2. Check files exist
console.log('\n2️⃣  Required Files:');
const files = [
  'utils/duoApi.js',
  'routers/duoRouter.js',
  'js/duo-license.js',
  'js/duo-payment-integration.js',
  'database_migrations/001_create_duo_licenses_table.sql',
  'docs/DUO_INTEGRATION.md'
];

files.forEach(file => {
  const fullPath = path.join(__dirname, file);
  if (fs.existsSync(fullPath)) {
    console.log(`   ✅ ${file}`);
  } else {
    console.log(`   ❌ ${file} - NOT FOUND`);
    allGood = false;
  }
});

// 3. Check server.js has Duo router
console.log('\n3️⃣  Server Configuration:');
const serverPath = path.join(__dirname, 'server.js');
const serverContent = fs.readFileSync(serverPath, 'utf8');

if (serverContent.includes('duoRouter')) {
  console.log('   ✅ Duo router is registered in server.js');
} else {
  console.log('   ❌ Duo router NOT found in server.js');
  allGood = false;
}

// 4. Check store.html includes duo-license.js
console.log('\n4️⃣  Frontend Integration:');
const storePath = path.join(__dirname, 'store.html');
const storeContent = fs.readFileSync(storePath, 'utf8');

if (storeContent.includes('duo-license.js')) {
  console.log('   ✅ duo-license.js is included in store.html');
} else {
  console.log('   ❌ duo-license.js NOT included in store.html');
  allGood = false;
}

if (storeContent.includes('duo-license-section')) {
  console.log('   ✅ Duo license section is in store.html');
} else {
  console.log('   ❌ Duo license section NOT in store.html');
  allGood = false;
}

// 5. Check order-success.html has integration
console.log('\n5️⃣  Payment Integration:');
const orderPath = path.join(__dirname, 'order-success.html');
const orderContent = fs.readFileSync(orderPath, 'utf8');

if (orderContent.includes('duo-payment-integration.js')) {
  console.log('   ✅ duo-payment-integration.js is included in order-success.html');
} else {
  console.log('   ❌ duo-payment-integration.js NOT included in order-success.html');
  allGood = false;
}

// Summary
console.log('\n' + '='.repeat(50));
if (allGood) {
  console.log('✅ All checks passed! System is ready.\n');
  console.log('📋 Next Steps:');
  console.log('   1. Update DUO_HOST in .env with your actual Duo API host');
  console.log('   2. Run: mysql -u root -p proq_pilot < database_migrations/001_create_duo_licenses_table.sql');
  console.log('   3. Start server: node server.js');
  console.log('   4. Visit: http://localhost:3000/store.html');
  console.log('   5. Scroll to "🔐 Duo Security Licenses" section\n');
} else {
  console.log('❌ Some checks failed. See errors above.\n');
  process.exit(1);
}
