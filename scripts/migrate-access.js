require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const db = require('../utils/db');

async function migrate() {
    const source = fs.readFileSync(path.join(__dirname, '../migrations/001_portal_access.sql'), 'utf8');
    const statements = source.replace(/^--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean);
    const connection = await db.getConnection();
    try {
        // Fail before creating anything if this is not the existing application database.
        await connection.query('SELECT userID, firstName, lastName, email, contact, password_hash, isActive, role FROM users LIMIT 0');
        for (const statement of statements) await connection.query(statement);
        console.log('Portal access schema is ready. Existing users and orders were preserved.');
    } finally { connection.release(); }
}

if (require.main === module) migrate().catch(error => {
    console.error('Access migration failed:', error.code || error.message);
    process.exitCode = 1;
}).finally(() => db.end());

module.exports = migrate;
