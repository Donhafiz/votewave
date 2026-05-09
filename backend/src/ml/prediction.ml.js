/**
 * ML PREDICTION ENGINE v3 (TEMPORAL + MOMENTUM MODEL)
 * ---------------------------------------------------
 * Upgrades:
 * - trend analysis
 * - momentum scoring
 * - turnout forecasting
 * - confidence scoring
 */

function calculateGrowthRate(history = []) {
  if (history.length < 2) return 0;

  const latest = history[history.length - 1];
  const previous = history[history.length - 2];

  return latest.voteCount - previous.voteCount;
}

function calculateMomentum(history = []) {
  if (history.length < 3) return 0;

  const last = history.slice(-3);

  const growth1 = last[1].voteCount - last[0].voteCount;
  const growth2 = last[2].voteCount - last[1].voteCount;

  return (growth2 - growth1) / (growth1 || 1);
}

function predictTurnout(state) {
  const base = state.totalVoters || 1000;
  const current = state.totalVotes || 0;

  const participationRate = current / base;

  // simple projection model (can later replace with ML model)
  const remainingPotential = base - current;

  return {
    projectedTurnout: Math.min(base, current + remainingPotential * 0.35),
    participationRate,
  };
}

function calculateConfidence(state, momentum) {
  let confidence = 0.5;

  if (momentum > 0.2) confidence += 0.2;
  if (momentum < -0.2) confidence -= 0.15;

  if (state.totalVotes > 1000) confidence += 0.1;

  return Math.min(0.95, Math.max(0.1, confidence));
}

/**
 * MAIN ML v3 ENGINE
 */
function predictElection(state) {
  const candidates = state.candidates || [];

  const enriched = candidates.map((c) => {
    const history = c.history || [];

    const growthRate = calculateGrowthRate(history);
    const momentum = calculateMomentum(history);

    return {
      candidateId: c.id,
      votes: c.votes,
      growthRate,
      momentumScore: momentum,
    };
  });

  const turnout = predictTurnout(state);

  const topCandidate = enriched.reduce((max, c) =>
    c.votes > (max?.votes || 0) ? c : max,
    null
  );

  const confidence = calculateConfidence(state, topCandidate?.momentumScore || 0);

  return {
    timestamp: new Date(),
    electionId: state.electionId,

    // core prediction
    winnerPrediction: topCandidate?.candidateId,

    // analytics
    candidates: enriched,

    // turnout forecast
    turnout,

    // system confidence
    confidenceScore: confidence,

    // system health signal
    stability: confidence > 0.7 ? "stable" : "volatile",
  };
}

module.exports = {
  predictElection,
};