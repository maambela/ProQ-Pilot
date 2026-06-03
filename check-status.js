const db = require('./utils/db');

(async () => {
  const conn = await db.getConnection();
  try {
    // Check approved Core API products
    const [approved] = await conn.query(
      'SELECT COUNT(*) as count FROM Products WHERE status = "approved" AND quantity > 0'
    );
    console.log('Approved products in DB:', approved[0].count);
    
    // Check approved with images
    const [withImages] = await conn.query(
      `SELECT COUNT(DISTINCT p.id) as count FROM Products p 
       INNER JOIN ProductImages pi ON p.id = pi.product_id 
       WHERE p.status = 'approved' AND p.quantity > 0`
    );
    console.log('Approved products WITH images:', withImages[0].count);
    
    // Check pending Core API products
    const [pending] = await conn.query(
      'SELECT COUNT(*) as count FROM Products WHERE status = "pending"'
    );
    console.log('Pending products in DB:', pending[0].count);
    
    // Sample approved products
    const [samples] = await conn.query(
      `SELECT id, product_name, price, quantity, status FROM Products 
       WHERE status = 'approved' LIMIT 5`
    );
    console.log('\nSample approved products:');
    samples.forEach(p => console.log(`- ${p.product_name} (ID: ${p.id})`));
    
  } catch(e) {
    console.error('DB Error:', e.message);
  } finally {
    conn.release();
    process.exit(0);
  }
})();
