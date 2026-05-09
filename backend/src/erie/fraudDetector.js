/**
 * Detects suspicious voting behavior
 */

async function analyze({ voteEvent }) {
  const flags = [];

  // Example signals

  if (!voteEvent.ip) {
    flags.push("MISSING_IP");
  }

  if (voteEvent.userAgent?.length < 10) {
    flags.push("SUSPICIOUS_USER_AGENT");
  }

  if (voteEvent.rapidRepeatVote) {
    flags.push("VOTE_STORM_PATTERN");
  }

  if (voteEvent.geoMismatch) {
    flags.push("LOCATION_ANOMALY");
  }

  return {
    flags,
    score: Math.min(1, flags.length * 0.25),
  };
}

module.exports = {
  analyze,
};