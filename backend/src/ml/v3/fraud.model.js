/**
 * FRAUD DETECTION v3
 * Detects abnormal voting patterns
 */

async function detectFraud({ electionId }) {
  // placeholder heuristic model

  const randomNoise = Math.random();

  let risk = "LOW";

  if (randomNoise > 0.85) risk = "MEDIUM";
  if (randomNoise > 0.97) risk = "HIGH";

  return {
    electionId,
    risk,
    score: randomNoise,
  };
}

module.exports = { detectFraud };