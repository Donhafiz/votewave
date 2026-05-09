const worker = new Worker(
  "vote-queue",
  async (job) => {
    const { userId, candidateId, electionId } = job.data;

    // IMPORTANT: idempotency check
    const existing = await Vote.findOne({
      userId,
      electionId,
    });

    if (existing) return { skipped: true };

    // transactional vote logic
    await voteService.castVote({
      userId,
      candidateId,
      electionId,
    });

    return { success: true };
  },
  {
    connection,
    concurrency: 20,

    // 🔥 production reliability
    removeOnComplete: true,
    removeOnFail: 1000,
  }
);

// ===== Observability =====
worker.on("completed", (job) => {
  console.log(`✔ Job completed: ${job.id}`);
});

worker.on("failed", (job, err) => {
  console.error(`✖ Job failed: ${job.id}`, err.message);
});

worker.on("stalled", (jobId) => {
  console.warn(`⚠ Job stalled: ${jobId}`);
});

// ===== Graceful shutdown =====
process.on("SIGINT", async () => {
  await worker.close();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await worker.close();
  process.exit(0);
});

module.exports = { worker };