// routers are used to define routes for different parts of the application
// its like a traffic director that directs requests to the right controller based on the URL and HTTP method
// if user requests /api/v1/signup it goes to authController.signup

const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const { protect } = require('../controllers/authController');
const Order = require('../models/orderModel'); // Importing the Order model

// defining the signup route
// when a POST request is made to /signup it calls the signup function from authController
router.post('/signup', authController.signup);
router.post('/login', authController.login);

// Route for email verification
router.get('/verify-email/:token', authController.verifyEmail);

// Route to fetch user-specific orders
router.get('/orders/user', protect, async (req, res) => {
    try {
        const userId = req.user.userID; // Fixed: use userID, not id
        const orders = await Order.findByUserId(userId); // Fetch orders for the user
        res.status(200).json(orders);
    } catch (err) {
        console.error('Error fetching orders:', err);
        res.status(500).json({ message: 'Failed to fetch orders', error: err.message });
    }
});

// Get user profile by ID
router.get('/:userID', async (req, res) => {
    try {
        const db = require('../utils/db');
        const connection = await db.getConnection();
        
        const [users] = await connection.query(
            'SELECT userID, firstName, lastName, email, contact FROM users WHERE userID = ?',
            [req.params.userID]
        );
        
        connection.release();
        
        if (users.length === 0) {
            return res.status(404).json({ 
                status: 'error', 
                message: 'User not found' 
            });
        }
        
        res.status(200).json({ 
            status: 'success', 
            data: users[0] 
        });
    } catch (err) {
        console.error('Error fetching user:', err);
        res.status(500).json({ 
            status: 'error', 
            message: 'Error fetching user profile' 
        });
    }
});

// Update user profile
router.patch('/:userID', async (req, res) => {
    try {
        const db = require('../utils/db');
        const connection = await db.getConnection();
        
        const { firstName, lastName, email, contact } = req.body;
        
        // Update user in database
        await connection.query(
            'UPDATE users SET firstName = ?, lastName = ?, email = ?, contact = ? WHERE userID = ?',
            [firstName, lastName, email, contact, req.params.userID]
        );
        
        connection.release();
        
        res.status(200).json({ 
            status: 'success', 
            message: 'User profile updated successfully',
            data: {
                userID: req.params.userID,
                firstName,
                lastName,
                email,
                contact
            }
        });
    } catch (err) {
        console.error('Error updating user:', err);
        res.status(500).json({ 
            status: 'error', 
            message: 'Error updating user profile' 
        });
    }
});

// export the router to be used in server.js
module.exports = router;