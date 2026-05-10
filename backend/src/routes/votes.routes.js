const express = require("express");
const router = express.Router();

const voteController = require("../controllers/voteController");
const { authenticate } = require("../middleware");

/* =========================================================
   CAST VOTE
========================================================= */
router.post(
  "/",
  authenticate,
  voteController.castVote
);

/* =========================================================
   GET VOTES
========================================================= */
router.get(
  "/:electionId",
  authenticate,
  voteController.getVotes
);

/* =========================================================
   GET STATS
========================================================= */
router.get(
  "/stats/:electionId",
  authenticate,
  voteController.getVoteStats
);

module.exports = router;