const os = require("os");
const cluster = require("cluster");
const { bootstrapERIEOrchestrator } = require("./erie.orchestrator");

/**
 * ERIE v2 CLUSTER ENGINE
 * -----------------------
 * - Spawns multiple worker processes
 * - Each worker handles intelligence stream partition
 */

async function bootstrapERIECluster(workers = os.cpus().length) {
  if (cluster.isPrimary) {
    console.log(`🧠 ERIE Master starting ${workers} nodes...`);

    for (let i = 0; i < workers; i++) {
      cluster.fork();
    }

    cluster.on("exit", (worker) => {
      console.log(`⚠ ERIE node crashed → restarting`);
      cluster.fork();
    });

    return;
  }

  // Worker process
  console.log(`🧠 ERIE Node running PID: ${process.pid}`);

  await bootstrapERIEOrchestrator();
}

module.exports = { bootstrapERIECluster };