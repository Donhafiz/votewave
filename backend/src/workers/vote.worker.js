const { Worker } = require("bullmq");
const connection = require("../config/redis");

const voteService = require("../services/voteService");
const resultCache = require("../services/resultCacheService");
const ElectionResult = require("../models/ElectionResult");

// 🧠 SaaS reliability layer (NEW)
const RetryGuard = require("../infrastructure/reliability/retry.guard");
const idempotency = require("../infrastructure/reliability/idempotency.store");

/* =========================================================
   RESULT UPDATE PIPELINE (REAL-TIME + PERSISTENCE)
========================================================= */
async function updateResults({ tenantId, electionId, candidateId }) {
  // 1. REAL-TIME LAYER (Redis)
  await resultCache.incrementVote(tenantId, electionId, candidateId);

  // 2. PERSISTENT LAYER (MongoDB)
  await ElectionResult.findOneAndUpdate(
    { tenantId, electionId, candidateId },
    {
      $inc: { voteCount: 1 },
      lastUpdated: new Date(),
    },
    { upsert: true, new: true }
  );
}

/* =========================================================
   WORKER CORE (SAAS V2 - HARDENED)
========================================================= */
const worker = new Worker(
  "vote-queue",
  async (job) => {
    const {
      tenantId,
      userId,
      electionId,
      candidateId,
      ip,
      userAgent,
      requestId,
    } = job.data;

    /* =====================================================
       1. IDEMPOTENCY LAYER (PREVENT DOUBLE VOTING)
    ===================================================== */
    const idempotencyKey = `${tenantId}:${userId}:${electionId}`;

    const alreadyProcessed = await idempotency.isProcessed(idempotencyKey);
    if (alreadyProcessed) {
      return {
        success: true,
        skipped: true,
        reason: "DUPLICATE_VOTE_PREVENTED",
      };
    }

    /* =====================================================
       2. EXECUTION SAFETY (RETRY + ISOLATION)
    ===================================================== */
    const result = await RetryGuard.execute(async () => {
      return await voteService.castVote({
        tenantId,
        userId,
        electionId,
        candidateId,
        ip,
        userAgent,
        requestId,
      });
    });

    /* =====================================================
       3. POST-SUCCESS PIPELINE
    ===================================================== */
    if (result?.success) {
      await updateResults({
        tenantId,
        electionId,
        candidateId,
      });

      // mark as processed ONLY after success
      await idempotency.markProcessed(idempotencyKey);
    }

    return result;
  },
  {
    connection,

    /* =====================================================
       SCALING LAYER
    ===================================================== */
    concurrency: 100,

    /* =====================================================
       RELIABILITY LAYER
    ===================================================== */
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },

    /* =====================================================
       MEMORY + CLEANUP CONTROL
    ===================================================== */
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 2000 },
  }
);

/* =========================================================
   OBSERVABILITY (PRODUCTION GRADE)
========================================================= */
worker.on("completed", (job) => {
  console.log("✔ Vote processed:", {
    jobId: job.id,
    electionId: job.data.electionId,
    candidateId: job.data.candidateId,
  });
});

worker.on("failed", (job, err) => {
  console.error("✖ Vote failed:", {
    jobId: job?.id,
    error: err.message,
  });
});

worker.on("stalled", (jobId) => {
  console.warn("⚠ Vote stalled:", jobId);
});

module.exports = { worker };