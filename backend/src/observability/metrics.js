const client = require("prom-client");

/* =========================================================
   GLOBAL REGISTRY
========================================================= */

const register = new client.Registry();

client.collectDefaultMetrics({
  register,
});

/* =========================================================
   HTTP METRICS
========================================================= */

const httpRequestCounter = new client.Counter({
  name: "http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status"],
});

const httpDurationHistogram = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration",
  labelNames: ["method", "route"],
  buckets: [0.1, 0.5, 1, 2, 5],
});

/* =========================================================
   VOTE METRICS
========================================================= */

const voteCounter = new client.Counter({
  name: "votes_processed_total",
  help: "Total processed votes",
  labelNames: ["tenantId", "electionId"],
});

const fraudCounter = new client.Counter({
  name: "fraud_events_total",
  help: "Total fraud detections",
  labelNames: ["severity"],
});

/* =========================================================
   QUEUE METRICS
========================================================= */

const queueGauge = new client.Gauge({
  name: "queue_jobs_waiting",
  help: "Jobs waiting in queue",
});

/* =========================================================
   REGISTER
========================================================= */

register.registerMetric(httpRequestCounter);
register.registerMetric(httpDurationHistogram);
register.registerMetric(voteCounter);
register.registerMetric(fraudCounter);
register.registerMetric(queueGauge);

module.exports = {
  register,
  httpRequestCounter,
  httpDurationHistogram,
  voteCounter,
  fraudCounter,
  queueGauge,
};