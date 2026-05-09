function encodeFeatures({ totalVotes, leaderVotes, spread }) {
  return [
    totalVotes / 1000,
    leaderVotes / (totalVotes || 1),
    spread / (totalVotes || 1),
  ];
}

module.exports = { encodeFeatures };