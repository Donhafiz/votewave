const express = require('express');
const router = express.Router();
const { adminController } = require('../controllers');
const {
  authenticate,
  authorize,
} = require('../middleware');

// All admin routes require admin or superadmin role
router.use(authenticate, authorize('admin', 'superadmin'));

router.get('/dashboard', adminController.getDashboardStats);
router.get('/users', adminController.getAllUsers);
router.get('/users/:userId', adminController.getUserById);
router.put('/users/:userId', adminController.updateUser);
router.put('/users/:userId/role', adminController.updateUserRole);
router.post('/users/:userId/ban', adminController.banUser);
router.post('/users/:userId/unban', adminController.unbanUser);
router.delete('/users/:userId', adminController.deleteUser);

router.get('/audit-logs', adminController.getAuditLogs);
router.get('/settings', adminController.getSystemSettings);
router.put('/settings', adminController.updateSystemSettings);
router.get('/export/:electionId/:format?', adminController.exportResults);

// Election management routes
router.post('/elections/:electionId/activate', adminController.activateElection);
router.post('/elections/:electionId/close', adminController.closeElection);
router.post('/elections/:electionId/assign-admin', adminController.assignElectionAdmin);
router.delete('/elections/:electionId/admins/:userId', adminController.removeElectionAdmin);
router.get('/elections/:electionId/monitoring', adminController.getElectionMonitoringData);

module.exports = router;
