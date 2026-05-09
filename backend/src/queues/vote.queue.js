const { Queue } = require("bullmq");
const connection = require("./connection");

const voteQueue = new Queue("vote-queue", { connection });

async function addVoteJob(data) {
  await voteQueue.add("process-vote", data, {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: true,
  });
}

module.exports = { voteQueue, addVoteJob };