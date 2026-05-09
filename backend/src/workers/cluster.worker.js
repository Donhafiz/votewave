const { Worker } = require("bullmq");
const connection = require("../config/redis");

const voteService = require("../services/voteService");

const worker = new Worker(
  "vote-queue:*", // wildcard partitioned queues
  async (job) => {
    return await voteService.castVote(job.data);
  },
  {
    connection,

    // 🚀 horizontal scaling power
    concurrency: 100,

    // prevent memory leaks at scale
    maxStalledCount: 1,
    stalledInterval: 30_000,
  }
);

module.exports = { worker };