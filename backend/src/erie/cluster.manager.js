const os = require("os");

/* =========================================================
   CLUSTER STRATEGY ENGINE
========================================================= */

function getClusterStrategy() {
  const cpuCount = os.cpus().length;

  return {
    workers: Math.max(2, cpuCount - 1),
    strategy: "election-sharded",
  };
}

function getShardKey(electionId) {
  // simple deterministic sharding
  return electionId % os.cpus().length;
}

module.exports = {
  getClusterStrategy,
  getShardKey,
};