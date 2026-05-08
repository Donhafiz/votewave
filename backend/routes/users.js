const express = require('express');
const router = express.Router();
const { userController } = require('../controllers');
const {
  authenticate,
  profileValidation,
  passwordChangeValidation,
  upload,
  handleUploadError,
} = require('../middleware');

router.get('/profile', authenticate, userController.getProfile);
router.put('/profile', authenticate, profileValidation, userController.updateProfile);
router.post('/avatar', authenticate, upload.single('avatar'), handleUploadError, userController.uploadAvatar);
router.put('/password', authenticate, passwordChangeValidation, userController.changePassword);
router.get('/voting-history', authenticate, userController.getVotingHistory);

module.exports = router;
