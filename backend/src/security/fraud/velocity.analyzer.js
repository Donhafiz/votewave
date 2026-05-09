const voteCounter = new Map();

/**
 * Detect sudden vote bursts (attack spikes)
 */

async function analyzeVelocity({ electionId }) {
  const now = Date.now();

  const entry = voteCounter.get(electionId) || {
    count: 0,
    last: now,
  };

  entry.count++;
  const delta = now - entry.last;

  voteCounter.set(electionId, {
    count: entry.count,
    last: now,
  });

  let risk = "LOW";

  if (entry.count > 100 && delta < 60000) {
    risk = "HIGH";
  } else if (entry.count > 50) {
    risk = "MEDIUM";
  }

  return { risk, count: entry.count };
}

module.exports = { analyzeVelocity };