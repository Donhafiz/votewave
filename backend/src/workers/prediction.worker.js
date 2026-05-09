const { Worker } = require("bullmq");
const connection = require("../config/redis");

const { predictWinner } = require("../services/predictService");
const { emitDashboardUpdate } = require("../sockets/socketManager");

const worker = new Worker(
  "analytics-queue",
  async (job) => {
    const { electionId, candidates } = job.data;

    const prediction = await predictWinner({
      electionId,
      candidates,
    });

    emitDashboardUpdate({
      type: "ELECTION_PREDICTION",
      electionId,
      prediction,
      timestamp: new Date(),
    });

    return prediction;
  },
  {
    connection,
    concurrency: 50,
  }
);

module.exports = { worker };