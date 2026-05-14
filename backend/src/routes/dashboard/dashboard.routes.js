const express = require("express");
const router = express.Router();

const controller = require("./dashboard.controller");

/**
 * LIVE DASHBOARD
 */
router.get(
  "/:tenantId/:electionId/live",
  controller.getLiveDashboard
);

module.exports = router;