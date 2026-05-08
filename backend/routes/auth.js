const express = require('express');
const router = express.Router();
const passport = require('passport');
const { authController } = require('../controllers');
const {
  registerValidation,
  loginValidation,
  authLimiter,
  authenticate,
} = require('../middleware');

router.post('/register', authLimiter, registerValidation, authController.register);
router.post('/verify-otp', authController.verifyOTP);
router.post('/resend-otp', authLimiter, authController.resendOTP);
router.post('/login', authLimiter, loginValidation, authController.login);
router.post('/refresh-token', authController.refreshToken);
router.post('/forgot-password', authLimiter, authController.forgotPassword);
router.post('/reset-password', authLimiter, authController.resetPassword);
router.post('/logout', authenticate, authController.logout);
router.get('/me', authenticate, authController.getMe);

// OAuth routes
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/google/callback', passport.authenticate('google', { failureRedirect: '/auth/login.html' }), authController.oauthCallback);
router.get('/github', passport.authenticate('github', { scope: ['user:email'] }));
router.get('/github/callback', passport.authenticate('github', { failureRedirect: '/auth/login.html' }), authController.oauthCallback);

module.exports = router;
