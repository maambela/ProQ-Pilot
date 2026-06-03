const db = require('./utils/db');
async function checkTables() {
    const connection = await db.getConnection();
    try {
        const [rows] = await connection.query('SHOW TABLES');
        console.log(rows);
    } catch (err) {
        console.error(err);
    } finally {
        connection.release();
        process.exit();
    }
}
checkTables();
