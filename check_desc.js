const db = require('./utils/db');

async function checkDescriptions() {
    try {
        const [rows] = await db.query('SELECT product_name, description FROM Products LIMIT 10');
        console.log('Descriptions in DB:');
        rows.forEach(r => {
            console.log(`--- ${r.product_name} ---`);
            console.log(r.description);
        });
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkDescriptions();
