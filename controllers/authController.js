const User = require('../models/userModel');
const catchAsync = require('./../utils/catchAsync');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const AppError = require('../utils/appError');
const { sendNoReplyEmail } = require('../utils/email');

function getPublicBaseUrl(req) {
    return (process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
}

function validatePassword(password, passwordConfirm) {
    if (!password || password.length < 8) return 'Password must be at least 8 characters';
    if (!/[A-Z]/.test(password)) return 'Password must include an uppercase letter';
    if (!/[0-9]/.test(password)) return 'Password must include a number';
    if (!/[^A-Za-z0-9]/.test(password)) return 'Password must include a special character';
    if (password !== passwordConfirm) return 'Passwords do not match';
    return null;
}

async function sendVerificationEmail(req, user, verificationToken) {
    const verifyURL = `${getPublicBaseUrl(req)}/verify-email.html?token=${encodeURIComponent(verificationToken)}`;
    const html = `
        <h1>Welcome to ProQ Pilot!</h1>
        <p>Please verify your email by clicking the link below:</p>
        <p><a href="${verifyURL}" target="_blank">Verify Email</a></p>
        <p>This link will expire in 24 hours.</p>
    `;

    await sendNoReplyEmail({
        to: user.email,
        subject: 'Email Verification - ProQ Pilot',
        html,
        text: `Welcome to ProQ Pilot. Verify your email within 24 hours: ${verifyURL}`
    });
}

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
        if (!existingUser.isActive) {
            const verificationToken = await User.refreshVerificationToken(existingUser.userID);
            await sendVerificationEmail(req, existingUser, verificationToken);

            return res.status(200).json({
                status: 'success',
                message: `A new verification email has been sent to ${existingUser.email}`
            });
        }
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

    console.log(`[AUTH] User created: ${newUser.email}, verification token: ${newUser.verificationToken ? 'YES' : 'NO'}`);

    // 4) Send verification email
    try {
        console.log(`[AUTH] Attempting to send verification email to: ${newUser.email}`);
        await sendVerificationEmail(req, newUser, newUser.verificationToken);

        console.log(`[AUTH] ✅ Verification email sent successfully to ${newUser.email}`);
        res.status(201).json({
            status: 'success',
            message: 'Verification email sent to ' + newUser.email
        });
    } catch (err) {
        console.error(`[AUTH] ❌ Email sending failed:`, err.message);
        return next(new AppError('Email configuration error. Please contact support. Error: ' + err.message, 500));
    }
});

exports.forgotPassword = catchAsync(async (req, res, next) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!email) {
        return next(new AppError('Please provide your email address', 400));
    }

    const reset = await User.createPasswordResetToken(email);

    if (reset) {
        const resetURL = `${getPublicBaseUrl(req)}/resetpassword.html?token=${encodeURIComponent(reset.resetToken)}`;
        const html = `
            <h1>Reset your ProQ Pilot password</h1>
            <p>We received a request to reset the password for your account.</p>
            <p><a href="${resetURL}" target="_blank">Choose a new password</a></p>
            <p>This link expires in one hour. If you did not request it, you can ignore this email.</p>
        `;

        try {
            await sendNoReplyEmail({
                to: reset.user.email,
                subject: 'Reset your ProQ Pilot password',
                html,
                text: `Reset your ProQ Pilot password within one hour: ${resetURL}`
            });
        } catch (error) {
            console.error('[AUTH] Password reset email failed:', error.message);
            return next(new AppError('We could not send the reset email. Please try again later.', 500));
        }
    }

    res.status(200).json({
        status: 'success',
        message: 'If an account exists for that email, a password reset link has been sent.'
    });
});

exports.resetPassword = catchAsync(async (req, res, next) => {
    const { token } = req.params;
    const passwordError = validatePassword(req.body.password, req.body.passwordConfirm);

    if (passwordError) {
        return next(new AppError(passwordError, 400));
    }

    const user = await User.findByPasswordResetToken(token);
    if (!user) {
        return next(new AppError('This password reset link is invalid or has expired', 400));
    }

    await User.resetPassword(user.userID, req.body.password);

    res.status(200).json({
        status: 'success',
        message: 'Your password has been reset. You can now sign in.'
    });
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
    user.role = String(user.role || 'client').trim().toLowerCase();

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
