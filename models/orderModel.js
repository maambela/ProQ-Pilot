const db = require('../utils/db');

const Order = {
  // Fetch all orders for a specific user with items and product details
  async findByUserId(userId) {
    const [orders] = await db.query(
      'SELECT * FROM Orders WHERE userID = ? ORDER BY created_at DESC',
      [userId]
    );
    
    // For each order, fetch its items with product details
    for (let order of orders) {
      const [items] = await db.query(
        `SELECT oi.id, oi.product_id, oi.quantity, oi.price, 
                p.product_name, p.product_number,
                pi.image_url
         FROM OrderItems oi
         LEFT JOIN products p ON oi.product_id = p.id
         LEFT JOIN product_images pi ON p.id = pi.product_id AND pi.is_primary = true
         WHERE oi.order_id = ?`,
        [order.id]
      );
      order.items = items;
    }
    
    return orders;
  },

  // Fetch a single order by ID with items
  async findById(orderId) {
    const [rows] = await db.query(
      'SELECT * FROM Orders WHERE id = ?',
      [orderId]
    );
    return rows[0];
  },

  // Create a new order
  async create(orderData) {
    const { userID, addressID, total_amount, status } = orderData;
    const [result] = await db.query(
      'INSERT INTO Orders (userID, addressID, total_amount, status, created_at) VALUES (?, ?, ?, ?, NOW())',
      [userID, addressID, total_amount, status || 'pending']
    );
    return result.insertId;
  },

  // Update order status
  async updateStatus(orderId, status) {
    await db.query(
      'UPDATE Orders SET status = ? WHERE id = ?',
      [status, orderId]
    );
  }
};

module.exports = Order;