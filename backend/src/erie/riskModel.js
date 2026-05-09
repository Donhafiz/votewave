/**
 * Combines all signals into single risk score
 */

function compute({ fraudSignals, anomalyScore, velocity }) {
  let score = 0;

  score += fraudSignals.score * 0.4;
  score += anomalyScore.score * 0.4;

  if (velocity.spike) score += 0.2;

  let level = "LOW";

  if (score > 0.8) level = "CRITICAL";
  else if (score > 0.6) level = "HIGH";
  else if (score > 0.3) level = "MEDIUM";

  return {
    score: Math.min(1, score),
    level,
  };
}

module.exports = {
  compute,
};