const { v4: uuidv4 } = require("uuid");

/* =========================================================
   REQUEST TRACING
========================================================= */

function requestTracer(req, res, next) {
  req.requestId = uuidv4();

  res.setHeader("x-request-id", req.requestId);

  next();
}

module.exports = requestTracer;