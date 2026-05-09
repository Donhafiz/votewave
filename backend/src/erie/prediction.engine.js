function predict(state) {
  const totalVotes = state.totalVotes || 1;

  const candidates = state.candidates || [];

  const predictions = candidates.map((c) => {
    const probability =
      (c.votes / totalVotes) * 100;

    return {
      candidateId: c.id,
      probability: parseFloat(probability.toFixed(2)),
    };
  });

  const leader = predictions.reduce((max, curr) =>
    curr.probability > max.probability ? curr : max
  );

  return {
    leader: leader.candidateId,
    confidence: leader.probability,
    predictions,
    timestamp: Date.now(),
  };
}

module.exports = {
  predict,
};