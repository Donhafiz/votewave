function generateInsights(metrics) {
  const insights = [];

  if (metrics.turnout > 0.5) {
    insights.push("High voter engagement detected");
  }

  if (metrics.totalVotes > 3000) {
    insights.push("Election is trending upward rapidly");
  }

  return insights;
}

module.exports = { generateInsights };