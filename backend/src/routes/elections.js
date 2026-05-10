const express = require("express");
const router = express.Router();

/* =========================================================
   DIRECT IMPORT (FIXS 90% OF YOUR ERRORS)
========================================================= */
const electionController = require("../controllers/electionController");

const {
  authenticate,
  authorize,
  optionalAuth,
  electionValidation,
  apiLimiter,
} = require("../middleware");

/* =========================================================
   PUBLIC / CORE ROUTES
========================================================= */

// Live elections (MUST COME BEFORE :id routes)
router.get("/live", electionController.getLiveElections);

// Public results
router.get("/public/:id/results", electionController.getPublicResults || ((req, res) => {
  return res.status(501).json({
    success: false,
    message: "getPublicResults not implemented",
  });
}));

// Get all elections
router.get(
  "/",
  optionalAuth,
  apiLimiter,
  electionController.getAllElections
);

// Get single election
router.get(
  "/:id",
  optionalAuth,
  electionController.getElectionById
);

/* =========================================================
   ADMIN ELECTION CRUD
========================================================= */

router.post(
  "/",
  authenticate,
  authorize("admin", "superadmin"),
  electionValidation,
  electionController.createElection
);

router.put(
  "/:id",
  authenticate,
  authorize("admin", "superadmin"),
  electionValidation,
  electionController.updateElection
);

router.delete(
  "/:id",
  authenticate,
  authorize("admin", "superadmin"),
  electionController.deleteElection
);

/* =========================================================
   BROADCAST
========================================================= */

router.post(
  "/:id/broadcast",
  authenticate,
  authorize("admin", "superadmin"),
  electionController.broadcastElection
);

/* =========================================================
   CATEGORY MANAGEMENT (SAFE GUARDS ADDED)
========================================================= */

router.post(
  "/:id/categories",
  authenticate,
  authorize("admin", "superadmin"),
  electionController.addCategory || ((req, res) => {
    res.status(501).json({ message: "addCategory not implemented" });
  })
);

router.put(
  "/:id/categories/:categoryId",
  authenticate,
  authorize("admin", "superadmin"),
  electionController.updateCategory || ((req, res) => {
    res.status(501).json({ message: "updateCategory not implemented" });
  })
);

router.delete(
  "/:id/categories/:categoryId",
  authenticate,
  authorize("admin", "superadmin"),
  electionController.deleteCategory || ((req, res) => {
    res.status(501).json({ message: "deleteCategory not implemented" });
  })
);

/* =========================================================
   NOMINEES
========================================================= */

router.post(
  "/:id/categories/:categoryId/nominees",
  authenticate,
  authorize("admin", "superadmin"),
  electionController.addNominee || ((req, res) => {
    res.status(501).json({ message: "addNominee not implemented" });
  })
);

router.delete(
  "/:id/categories/:categoryId/nominees/:nomineeId",
  authenticate,
  authorize("admin", "superadmin"),
  electionController.removeNominee || ((req, res) => {
    res.status(501).json({ message: "removeNominee not implemented" });
  })
);

module.exports = router;