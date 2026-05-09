const express = require('express');
const router = express.Router();
const { electionController } = require('../controllers');
const {
  authenticate,
  authorize,
  optionalAuth,
  electionValidation,
  apiLimiter,
} = require('../middleware');

router.get('/', optionalAuth, apiLimiter, electionController.getAllElections);
router.get('/public/:id/results', electionController.getPublicResults);
router.get('/:id', optionalAuth, electionController.getElectionById);

router.post('/', 
  authenticate, 
  authorize('admin', 'superadmin'), 
  electionValidation, 
  electionController.createElection
);

router.put('/:id', 
  authenticate, 
  authorize('admin', 'superadmin'), 
  electionValidation, 
  electionController.updateElection
);

router.delete('/:id', 
  authenticate, 
  authorize('admin', 'superadmin'), 
  electionController.deleteElection
);

// Category routes
router.post('/:id/categories', 
  authenticate, 
  authorize('admin', 'superadmin'), 
  electionController.addCategory
);

router.put('/:id/categories/:categoryId', 
  authenticate, 
  authorize('admin', 'superadmin'), 
  electionController.updateCategory
);

router.delete('/:id/categories/:categoryId', 
  authenticate, 
  authorize('admin', 'superadmin'), 
  electionController.deleteCategory
);

// Nominee routes
router.post('/:id/categories/:categoryId/nominees', 
  authenticate, 
  authorize('admin', 'superadmin'), 
  electionController.addNominee
);

router.delete('/:id/categories/:categoryId/nominees/:nomineeId', 
  authenticate, 
  authorize('admin', 'superadmin'), 
  electionController.removeNominee
);

// Broadcast routes
router.post('/:id/broadcast', 
  authenticate, 
  authorize('admin', 'superadmin'), 
  electionController.broadcastElection
);

// Public routes
router.get('/live', electionController.getLiveElections);

module.exports = router;
