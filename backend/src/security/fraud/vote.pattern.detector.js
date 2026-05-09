const userHistory = new Map();

/**
 * Detect repetitive or automated voting patterns
 */

async function detectVotePatterns({ userId }) {
  const history = userHistory.get(userId) || [];

  history.push(Date.now());
  userHistory.set(userId, history.slice(-20));

  let risk = "LOW";

  if (history.length > 10) {
    const intervals = [];

    for (let i = 1; i < history.length; i++) {
      intervals.push(history[i] - history[i - 1]);
    }

    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;

    if (avg < 3000) risk = "HIGH"; // too fast voting
    else if (avg < 10000) risk = "MEDIUM";
  }

  return { risk };
}

module.exports = { detectVotePatterns };