const express = require('express');
const router = express.Router({ mergeParams: true });
const { candidateController } = require('../controllers');
const {
  authenticate,
  authorize,
  candidateValidation,
  upload,
  handleUploadError,
} = require('../middleware');

router.get('/', candidateController.getCandidatesByElection);

router.post('/',
  authenticate,
  authorize('admin', 'superadmin'),
  upload.single('photo'),
  handleUploadError,
  candidateValidation,
  candidateController.createCandidate
);

router.put('/:candidateId',
  authenticate,
  authorize('admin', 'superadmin'),
  upload.single('photo'),
  handleUploadError,
  candidateValidation,
  candidateController.updateCandidate
);

router.delete('/:candidateId',
  authenticate,
  authorize('admin', 'superadmin'),
  candidateController.deleteCandidate
);

router.put('/reorder',
  authenticate,
  authorize('admin', 'superadmin'),
  candidateController.reorderCandidates
);

module.exports = router;
