/**
 * Converts backend intelligence → frontend-safe UI payload
 */

function mapDashboard(data) {
  return {
    header: {
      electionId: data.meta.electionId,
      updatedAt: data.meta.generatedAt,
    },

    intelligence: {
      status: data.intelligence.classification,
      risk: data.intelligence.intelligence?.riskScore,
      confidence: data.intelligence.fusedScore?.score,
    },

    leaderboard: data.leaderboard,

    highlights: {
      winnerPrediction:
        data.intelligence.prediction?.winnerPrediction,
      volatility: data.intelligence.classification,
    },
  };
}

module.exports = {
  mapDashboard,
};