const { Worker } = require("bullmq");
const connection = require("../../config/redis");

const voteService = require("../../services/voteService");
const RetryGuard = require("../../infrastructure/reliability/retry.guard");
const idempotency = require("../../infrastructure/reliability/idempotency.store");

const { processIntelligence } = require("./erie.engine");

async function processVote(job) {
  const {
    tenantId,
    userId,
    electionId,
    candidateId,
    ip,
    userAgent,
    requestId,
  } = job.data;

  const idempotencyKey = `${tenantId}:${userId}:${electionId}`;

  if (await idempotency.isProcessed(idempotencyKey)) {
    return { skipped: true };
  }

  return await RetryGuard.execute(async () => {
    const result = await voteService.castVote({
      tenantId,
      userId,
      electionId,
      candidateId,
      ip,
      userAgent,
      requestId,
    });

    if (result?.success) {
      await processIntelligence({
        tenantId,
        electionId,
        candidateId,
      });

      await idempotency.markProcessed(idempotencyKey);
    }

    return result;
  });
}

/**
 * SHARDED WORKER (ERIE v2 CORE)
 */
function createERIEWorker(shardId) {
  return new Worker(
    `vote-queue:shard:${shardId}`,
    async (job) => processVote(job),
    {
      connection,
      concurrency: 100,
      removeOnComplete: 1000,
      removeOnFail: 2000,
      attempts: 3,
    }
  );
}

module.exports = {
  createERIEWorker,
};