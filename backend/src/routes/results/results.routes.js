const express = require("express");

const {
  getRealtimeResults,
} = require("./results.controller");

const router = express.Router();

router.get(
  "/:tenantId/:electionId",
  getRealtimeResults
);

module.exports = router;