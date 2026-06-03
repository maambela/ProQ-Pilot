const db = require('./utils/db');
async function checkCounts() {
    const connection = await db.getConnection();
    try {
        const [rows1] = await connection.query('SELECT COUNT(*) as count FROM product_images');
        console.log('product_images count:', rows1[0].count);
        const [rows2] = await connection.query('SELECT COUNT(*) as count FROM productimages');
        console.log('productimages count:', rows2[0].count);
    } catch (err) {
        console.error(err);
    } finally {
        connection.release();
        process.exit();
    }
}
checkCounts();
