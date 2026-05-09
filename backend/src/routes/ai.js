const express = require('express');
const router = express.Router();
const { aiController } = require('../controllers');
const {
  authenticate,
  authorize,
  optionalAuth,
  aiLimiter,
} = require('../middleware');

router.post('/chat', optionalAuth, aiLimiter, aiController.chat);

router.get('/elections/:electionId/summary',
  authenticate,
  authorize('admin', 'superadmin'),
  aiLimiter,
  aiController.generateSummary
);

router.get('/elections/:electionId/insights',
  authenticate,
  authorize('admin', 'superadmin'),
  aiLimiter,
  aiController.getInsights
);

router.get('/elections/:electionId/anomalies',
  authenticate,
  authorize('admin', 'superadmin'),
  aiController.checkAnomalies
);

module.exports = router;
