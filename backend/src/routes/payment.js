const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const {
  authenticate,
  authorize,
} = require('../middleware');

// Middleware to capture raw body for webhook verification
const captureRawBody = (req, res, buf, encoding) => {
  if (buf && buf.length) {
    req.rawBody = buf.toString(encoding || 'utf8');
  }
};

// Public webhook endpoint (no auth required) - capture raw body
router.post('/webhook', express.json({ verify: captureRawBody }), paymentController.handleWebhook);

// Protected routes
router.use(authenticate);

// Voting payment routes
router.post('/vote/initialize', paymentController.initializePayment);
router.get('/vote/verify/:reference', paymentController.verifyPayment);
router.get('/vote/status/:reference', paymentController.getPaymentStatus);
router.get('/user/payments', paymentController.getUserPayments);

// Legacy election activation payment routes
router.post('/initialize', authorize('admin', 'superadmin'), paymentController.initializeElectionPayment);
router.get('/verify', paymentController.verifyPayment); // This might need to be updated for legacy
router.get('/status/:electionId', authorize('admin', 'superadmin'), paymentController.getPaymentStatus);

module.exports = router;