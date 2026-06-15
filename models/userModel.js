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

    async refreshVerificationToken(userID) {
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

        await db.query(
            `UPDATE users
             SET verificationToken = ?, verificationTokenExpires = ?
             WHERE userID = ? AND isActive = 0`,
            [verificationToken, verificationTokenExpires, userID]
        );

        return verificationToken;
    },

    async createPasswordResetToken(email) {
        const user = await this.findByEmail(email);
        if (!user) return null;

        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
        const resetTokenExpires = new Date(Date.now() + 60 * 60 * 1000);

        await db.query(
            'UPDATE users SET resetToken = ?, resetTokenExpires = ? WHERE userID = ?',
            [resetTokenHash, resetTokenExpires, user.userID]
        );

        return { user, resetToken };
    },

    async findByPasswordResetToken(token) {
        const resetTokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const [rows] = await db.query(
            'SELECT * FROM users WHERE resetToken = ? AND resetTokenExpires > NOW()',
            [resetTokenHash]
        );
        return rows[0];
    },

    async resetPassword(userID, password) {
        const password_hash = await bcrypt.hash(password, 12);
        await db.query(
            `UPDATE users
             SET password_hash = ?, resetToken = NULL, resetTokenExpires = NULL
             WHERE userID = ?`,
            [password_hash, userID]
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
