function computeHealth(metrics) {
  let status = "STABLE";

  if (metrics.turnout > 0.7) status = "HIGH ACTIVITY";
  if (metrics.totalVotes > 5000) status = "VIRAL LOAD";

  return {
    status,
    score: metrics.turnout,
  };
}

module.exports = { computeHealth };