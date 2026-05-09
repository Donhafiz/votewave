/**
 * Detects statistical abnormalities in voting behavior
 */

async function compute({ voteEvent }) {
  let score = 0;

  if (voteEvent.spikeDetected) score += 0.4;
  if (voteEvent.unusualHour) score += 0.2;
  if (voteEvent.geoCluster) score += 0.3;

  return {
    score: Math.min(1, score),
    type:
      score > 0.7
        ? "HIGH_ANOMALY"
        : score > 0.4
        ? "MODERATE_ANOMALY"
        : "NORMAL",
  };
}

module.exports = {
  compute,
};