const ml = require("../ml/prediction.ml");
const erie = require("../erie/engine");
const stateStore = require("../erie/state.store"); // optional if you already have it

/**
 * AI FUSION ENGINE v3
 * --------------------
 * Combines:
 * - ML prediction (trend + forecasting)
 * - ERIE risk intelligence (fraud/anomaly)
 * - live election state
 */

async function generateElectionIntelligence({
  tenantId,
  electionId,
}) {
  // 1. Load current election state
  const state = await stateStore.getElectionState(
    tenantId,
    electionId
  );

  // 2. ML prediction layer
  const mlResult = ml.predictElection(state);

  // 3. ERIE intelligence layer (risk + fraud signals)
  const erieResult = await erie.analyzeElection({
    tenantId,
    electionId,
    voteEvent: {
      synthetic: true, // aggregate mode (not single vote)
    },
  });

  // 4. Fusion scoring engine
  const fusedScore = computeFusionScore(mlResult, erieResult);

  // 5. Election state classification
  const classification = classifyElectionState(fusedScore);

  return {
    electionId,
    tenantId,

    // ML output
    prediction: mlResult,

    // ERIE output
    intelligence: erieResult,

    // fused AI layer
    fusedScore,

    classification,

    generatedAt: new Date(),
  };
}

/**
 * FUSION SCORING ENGINE
 */
function computeFusionScore(mlResult, erieResult) {
  const mlConfidence = mlResult.confidenceScore || 0.5;
  const risk = erieResult.riskScore || 0;

  const momentum =
    mlResult.candidates?.reduce(
      (sum, c) => sum + (c.momentumScore || 0),
      0
    ) || 0;

  // Core fusion formula (adjustable later)
  const score =
    mlConfidence * 0.5 +
    (1 - risk) * 0.3 +
    normalizeMomentum(momentum) * 0.2;

  return {
    score: Math.min(1, Math.max(0, score)),
    mlConfidence,
    risk,
    momentum,
  };
}

/**
 * NORMALIZE MOMENTUM (-∞ → +∞ → 0–1)
 */
function normalizeMomentum(m) {
  if (!m) return 0.5;
  return 1 / (1 + Math.exp(-m)); // sigmoid normalization
}

/**
 * CLASSIFICATION ENGINE
 */
function classifyElectionState(fused) {
  const score = fused.score;

  if (fused.risk > 0.75) {
    return "CRITICAL_RISK"; // fraud likely
  }

  if (score > 0.8) return "STABLE_LEADING";
  if (score > 0.6) return "COMPETITIVE";
  if (score > 0.4) return "VOLATILE";
  return "UNSTABLE";
}

module.exports = {
  generateElectionIntelligence,
};