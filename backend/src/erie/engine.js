const fraudDetector = require("./fraudDetector");
const anomalyScorer = require("./anomalyScorer");
const velocityTracker = require("./velocityTracker");
const riskModel = require("./riskModel");

/**
 * ERIE v2 ORCHESTRATOR
 * ---------------------
 * Combines all intelligence signals into one decision layer
 */

async function analyzeElection({ tenantId, electionId, voteEvent }) {
  // 1. Fraud detection
  const fraudSignals = await fraudDetector.analyze({
    tenantId,
    electionId,
    voteEvent,
  });

  // 2. Anomaly scoring
  const anomalyScore = await anomalyScorer.compute({
    tenantId,
    electionId,
    voteEvent,
  });

  // 3. Velocity tracking
  const velocity = await velocityTracker.track({
    tenantId,
    electionId,
    voteEvent,
  });

  // 4. Final risk aggregation
  const risk = riskModel.compute({
    fraudSignals,
    anomalyScore,
    velocity,
  });

  return {
    electionId,
    tenantId,

    fraudSignals,
    anomalyScore,
    velocity,

    riskScore: risk.score,
    riskLevel: risk.level, // LOW | MEDIUM | HIGH | CRITICAL

    flagged: risk.score > 0.7,
    timestamp: new Date(),
  };
}

module.exports = {
  analyzeElection,
};