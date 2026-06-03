const db = require('./utils/db');

async function checkBrands() {
    try {
        const connection = await db.getConnection();
        try {
            // Get all distinct brands
            const [brands] = await connection.query(`
                SELECT DISTINCT brand, COUNT(*) as count
                FROM products
                WHERE brand IS NOT NULL
                GROUP BY brand
                ORDER BY count DESC
            `);

            console.log('\n=== Available Brands in Database ===');
            brands.forEach(b => {
                console.log(`${b.brand}: ${b.count} products`);
            });
        } finally {
            connection.release();
        }
        process.exit(0);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}

checkBrands();
