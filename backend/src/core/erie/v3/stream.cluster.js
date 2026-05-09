const cluster = require("cluster");
const os = require("os");
const { startStreamBroker } = require("./stream.broker");

async function bootstrapERIEv3() {
  if (cluster.isPrimary) {
    const workers = os.cpus().length;

    console.log(`🌐 ERIE v3 Cluster starting ${workers} nodes`);

    for (let i = 0; i < workers; i++) {
      cluster.fork();
    }

    cluster.on("exit", () => {
      console.log("⚠ ERIE node restarted");
      cluster.fork();
    });

    return;
  }

  await startStreamBroker();
}

module.exports = { bootstrapERIEv3 };