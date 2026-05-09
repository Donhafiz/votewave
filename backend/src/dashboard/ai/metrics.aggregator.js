async function aggregateMetrics({ electionId }) {
  return {
    totalVotes: Math.floor(Math.random() * 10000),
    activeUsers: Math.floor(Math.random() * 500),
    turnout: Math.random(),
  };
}

module.exports = { aggregateMetrics };