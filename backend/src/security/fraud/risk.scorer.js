function computeRiskScore({ ipRisk, patternRisk, velocityRisk }) {
  let score = 0;

  const map = {
    LOW: 0,
    MEDIUM: 0.5,
    HIGH: 1,
  };

  score += map[ipRisk.risk || ipRisk] || 0;
  score += map[patternRisk.risk || patternRisk] || 0;
  score += map[velocityRisk.risk || velocityRisk] || 0;

  const normalized = score / 3;

  return {
    score: normalized,
    level:
      normalized > 0.7
        ? "HIGH"
        : normalized > 0.4
        ? "MEDIUM"
        : "LOW",
  };
}

module.exports = { computeRiskScore };