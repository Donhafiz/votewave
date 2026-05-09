const resultCache = require("../services/resultCacheService");

async function predictWinner({ electionId, candidates }) {
  const scores = [];

  for (const candidateId of candidates) {
    const votes = await resultCache.getVotes(electionId, candidateId);

    scores.push({
      candidateId,
      votes,
      velocity: votes / 10, // simplified trend proxy
    });
  }

  // weighted scoring
  const ranked = scores.map((c) => ({
    ...c,
    score: c.votes * 0.7 + c.velocity * 0.3,
  }));

  ranked.sort((a, b) => b.score - a.score);

  return {
    predictedWinner: ranked[0],
    confidence: calculateConfidence(ranked),
    ranking: ranked,
  };
}

function calculateConfidence(ranked) {
  const gap = ranked[0].score - (ranked[1]?.score || 0);
  return Math.min(100, Math.floor(gap));
}

module.exports = { predictWinner };