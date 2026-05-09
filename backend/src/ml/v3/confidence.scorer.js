function computeConfidence({ prediction, fraudScore, trend }) {
  let score = prediction?.probability || 0;

  // penalize fraud
  if (fraudScore?.risk === "HIGH") score -= 0.3;
  if (fraudScore?.risk === "MEDIUM") score -= 0.15;

  // boost strong trends
  if (trend?.momentum === "HIGH") score += 0.1;

  return {
    confidence: Math.max(0, Math.min(1, score)),
  };
}

module.exports = { computeConfidence };