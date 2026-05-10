const express = require("express");
const passport = require("../config/passport");

const router = express.Router();

/* =========================================================
   GOOGLE AUTH
========================================================= */

router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
  })
);

router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: "/login",
    session: true,
  }),
  (req, res) => {
    res.redirect(
      process.env.FRONTEND_URL || "/"
    );
  }
);

/* =========================================================
   GITHUB AUTH
========================================================= */

router.get(
  "/github",
  passport.authenticate("github", {
    scope: ["user:email"],
  })
);

router.get(
  "/github/callback",
  passport.authenticate("github", {
    failureRedirect: "/login",
    session: true,
  }),
  (req, res) => {
    res.redirect(
      process.env.FRONTEND_URL || "/"
    );
  }
);

module.exports = router;