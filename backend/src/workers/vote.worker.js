const { Worker } = require("bullmq");
const connection = require("../queues/connection");
const eventBus = require("../events/eventBus");

new Worker(
  "vote-queue",
  async (job) => {
    const { electionId, candidateId, userId } = job.data;

    // simulate heavy processing logic
    console.log("Processing vote in background...");

    eventBus.emit("vote:update", {
      electionId,
      candidateId,
    });

    eventBus.emit("dashboard:update", {
      incrementVotes: 1,
    });
  },
  { connection }
);

console.log("🟢 Vote Worker running");