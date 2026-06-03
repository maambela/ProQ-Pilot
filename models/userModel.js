const validator = require('validator');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../utils/db');

const User = {
    async create(userData) {
        const { firstName, lastName, email, contact, password } = userData;

        // Hash the password
        const password_hash = await bcrypt.hash(password, 12);
        
        // Generate verification token
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        const [result] = await db.query(
            `INSERT INTO users (firstName, lastName, email, contact, password_hash, verificationToken, verificationTokenExpires, isActive) 
             VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
            [firstName, lastName, email, contact, password_hash, verificationToken, verificationTokenExpires]
        );

        return {
            userID: result.insertId,
            firstName,
            lastName,
            email,
            contact,
            role: 'client',
            verificationToken
        };
    },

    async findByEmail(email) {
        const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        return rows[0];
    },

    async findById(id) {
        const [rows] = await db.query('SELECT * FROM users WHERE userID = ?', [id]);
        return rows[0];
    },

    async findByToken(token) {
        const [rows] = await db.query(
            'SELECT * FROM users WHERE verificationToken = ? AND verificationTokenExpires > NOW()',
            [token]
        );
        return rows[0];
    },

    async verifyUser(userID) {
        await db.query(
            'UPDATE users SET isActive = 1, verificationToken = NULL, verificationTokenExpires = NULL WHERE userID = ?',
            [userID]
        );
    },

    validate(data) {
        const errors = [];
        if (!data.firstName) errors.push('Please provide your first name');
        if (!data.lastName) errors.push('Please provide your last name');
        if (!data.email || !validator.isEmail(data.email)) errors.push('Please provide a valid email');
        if (!data.password || data.password.length < 8) errors.push('Password must be at least 8 characters');
        if (data.password !== data.passwordConfirm) errors.push('Passwords do not match');
        return errors;
    }
};

module.exports = User;
