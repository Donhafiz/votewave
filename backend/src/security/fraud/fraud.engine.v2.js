const eventBus = require("../../events/eventBus");

const { analyzeIPClusters } = require("./ip.cluster.analyzer");
const { detectVotePatterns } = require("./vote.pattern.detector");
const { analyzeVelocity } = require("./velocity.analyzer");
const { computeRiskScore } = require("./risk.scorer");

/**
 * FRAUD ENGINE v2 (SaaS SECURITY CORE)
 * ------------------------------------
 * Aggregates multiple fraud signals into one risk decision
 */

async function runFraudEngine(payload) {
  const ipRisk = await analyzeIPClusters(payload);
  const patternRisk = await detectVotePatterns(payload);
  const velocityRisk = await analyzeVelocity(payload);

  const risk = computeRiskScore({
    ipRisk,
    patternRisk,
    velocityRisk,
  });

  const result = {
    tenantId: payload.tenantId,
    electionId: payload.electionId,
    risk,
    timestamp: Date.now(),
  };

  // 🚨 emit to ERIE security layer
  eventBus.emit("fraud:analysis", result);

  return result;
}

module.exports = { runFraudEngine };