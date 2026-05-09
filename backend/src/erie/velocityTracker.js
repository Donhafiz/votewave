/**
 * Tracks vote speed per election
 */

const voteBuckets = new Map();

async function track({ electionId }) {
  const now = Date.now();

  if (!voteBuckets.has(electionId)) {
    voteBuckets.set(electionId, []);
  }

  const bucket = voteBuckets.get(electionId);

  bucket.push(now);

  // keep last 60 seconds only
  const filtered = bucket.filter((t) => now - t < 60000);
  voteBuckets.set(electionId, filtered);

  const velocity = filtered.length; // votes per minute

  return {
    votesPerMinute: velocity,
    spike: velocity > 100, // threshold (tune later)
  };
}

module.exports = {
  track,
};