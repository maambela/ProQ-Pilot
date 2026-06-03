const User = require('../models/userModel');
const catchAsync = require('./../utils/catchAsync');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const AppError = require('../utils/appError');
const sendEmail = require('../utils/email');

function getJwtSecret() {
    const secret = process.env.ACCESS_TOKEN_SECRET || process.env.JWT_SECRET;
    if (!secret && process.env.NODE_ENV === 'production') {
        throw new Error('ACCESS_TOKEN_SECRET is required in production');
    }
    return secret || 'local-development-access-token-secret';
}

const signToken = (id) => {
    return jwt.sign({ id }, getJwtSecret(), {
        expiresIn: '90d'
    });
};

exports.signup = catchAsync(async (req, res, next) => {
    // 1) Validate input
    const errors = User.validate(req.body);
    if (errors.length > 0) {
        return next(new AppError(errors.join(', '), 400));
    }

    // 2) Check if user already exists
    const existingUser = await User.findByEmail(req.body.email);
    if (existingUser) {
        return next(new AppError('Email already in use', 400));
    }

    // 3) Create new user
    const newUser = await User.create({
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        email: req.body.email,
        contact: req.body.contact,
        password: req.body.password,
        passwordConfirm: req.body.passwordConfirm
    });

    // 4) Send verification email
    const verifyURL = `${req.protocol}://${req.get('host')}/verify-email.html?token=${newUser.verificationToken}`;
    
    const html = `
        <h1>Welcome to ProQ Pilot!</h1>
        <p>Please verify your email by clicking the link below:</p>
        <a href="${verifyURL}" target="_blank">Verify Email</a>
        <p>This link will expire in 24 hours.</p>
    `;

    try {
        await sendEmail({
            email: newUser.email,
            subject: 'Email Verification - ProQ Pilot',
            html
        });

        res.status(201).json({
            status: 'success',
            message: 'Verification email sent to ' + newUser.email
        });
    } catch (err) {
        return next(new AppError('There was an error sending the email. Try again later.', 500));
    }
});

exports.verifyEmail = catchAsync(async (req, res, next) => {
    const user = await User.findByToken(req.params.token);

    if (!user) {
        return next(new AppError('Token is invalid or has expired', 400));
    }

    await User.verifyUser(user.userID);

    res.status(200).json({
        status: 'success',
        message: 'Email verified successfully!'
    });
});

exports.login = catchAsync(async (req, res, next) => {
    const { email, password } = req.body;

    // 1) Check if email and password exist
    if (!email || !password) {
        return next(new AppError('Please provide email and password', 400));
    }

    // 2) Check if user exists && password is correct
    const user = await User.findByEmail(email);

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
        return next(new AppError('Incorrect email or password', 401));
    }

    // 3) Check if user is verified
    if (!user.isActive) {
        return next(new AppError('Please verify your email before logging in', 401));
    }

    // 4) If everything ok, send token to client
    const token = signToken(user.userID);

    // Hide password from output
    user.password_hash = undefined;

    res.status(200).json({
        status: 'success',
        token,
        data: {
            user
        }
    });
});

exports.protect = catchAsync(async (req, res, next) => {
    // 1) Get token and check if it exists
    let token;
    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        return next(new AppError('You are not logged in! Please log in to get access.', 401));
    }

    // 2) Verify token
    const decoded = jwt.verify(token, getJwtSecret());

    // 3) Check if user still exists
    const currentUser = await User.findById(decoded.id);
    if (!currentUser) {
        return next(new AppError('The user belonging to this token no longer exists.', 401));
    }

    // 4) Grant access to protected route
    req.user = currentUser;
    next();
});
