function predict(features) {
  // simple neural-inspired scoring model (v4 baseline)

  const dominance = features.leaderVotes / (features.totalVotes || 1);
  const competitiveness = features.spread / (features.totalVotes || 1);

  let probability = dominance * 0.7 + (1 - competitiveness) * 0.3;

  return {
    winnerProbability: Math.max(0, Math.min(1, probability)),
  };
}

module.exports = { predict };