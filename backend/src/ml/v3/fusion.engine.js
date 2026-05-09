const eventBus = require("../../events/eventBus");

const { predictWinner } = require("./predictor");
const { detectFraud } = require("./fraud.model");
const { analyzeTrend } = require("./trend.analyzer");
const { computeConfidence } = require("./confidence.scorer");

/**
 * ML v3 FUSION ENGINE
 * --------------------
 * Combines multiple AI signals into ONE intelligence output
 */

async function runFusionEngine(payload) {
  const { tenantId, electionId } = payload;

  // 1. Get AI signals
  const prediction = await predictWinner(payload);
  const fraudScore = await detectFraud(payload);
  const trend = await analyzeTrend(payload);
  const confidence = computeConfidence({
    prediction,
    fraudScore,
    trend,
  });

  const intelligence = {
    tenantId,
    electionId,
    prediction,
    fraudScore,
    trend,
    confidence,
    timestamp: Date.now(),
  };

  // 2. Emit to ERIE + Dashboard
  eventBus.emit("ml:intelligence:update", intelligence);

  return intelligence;
}

module.exports = { runFusionEngine };