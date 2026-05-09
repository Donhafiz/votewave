const ipMap = new Map();

/**
 * Detect IP clustering (multi-voting abuse signals)
 */

async function analyzeIPClusters({ ip, userId }) {
  const key = `${ip}:${userId}`;

  const count = ipMap.get(key) || 0;
  ipMap.set(key, count + 1);

  let risk = "LOW";

  if (count > 5) risk = "MEDIUM";
  if (count > 15) risk = "HIGH";

  return { risk, count };
}

module.exports = { analyzeIPClusters };