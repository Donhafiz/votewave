const express = require("express");
const router = express.Router();

const { register } = require("./metrics");

/* =========================================================
   PROMETHEUS EXPORTER
========================================================= */

router.get("/metrics", async (req, res) => {
  res.set("Content-Type", register.contentType);

  const metrics = await register.metrics();

  res.end(metrics);
});

module.exports = router;