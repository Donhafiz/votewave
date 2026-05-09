const express = require('express');
const router = express.Router({ mergeParams: true });
const { voteController } = require('../controllers');
const {
  authenticate,
  voteValidation,
  voteLimiter,
} = require('../middleware');

router.post('/',
  authenticate,
  voteLimiter,
  voteValidation,
  voteController.castVote
);

router.get('/status',
  authenticate,
  voteController.getVoteStatus
);

router.get('/verify/:confirmationCode',
  authenticate,
  voteController.verifyVote
);

module.exports = router;
