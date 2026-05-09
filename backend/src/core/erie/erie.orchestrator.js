const eventBus = require("../../events/eventBus");

const { processStreamEvent } = require("./erie.stream");
const { updateState } = require("./erie.state");

const { runFraudEngine } = require("../../security/fraud/fraud.engine.v2");
const { runFusionEngine } = require("../../ml/v3/fusion.engine");
const { runDashboardAI } = require("../../dashboard/ai/dashboard.ai.engine");
const { runDeepLearningEngine } = require("../../ml/v4/deep.engine");

const { bootstrapERIEv3 } = require("./v3/stream.cluster");

/**
 * ERIE ORCHESTRATOR v3 (CLEAN PIPELINE ARCHITECTURE)
 * --------------------------------------------------
 * Order of execution:
 * 1. Stream processing
 * 2. Fraud detection (blocking layer)
 * 3. State update (consistency layer)
 * 4. AI Fusion engine (decision layer)
 * 5. Deep Learning engine (prediction layer)
 * 6. Dashboard AI (UI intelligence layer)
 */

async function bootstrapERIEOrchestrator() {
  console.log("🧠 ERIE Orchestrator v3 online");

  /**
   * =========================
   * VOTE PIPELINE (CORE FLOW)
   * =========================
   */
  eventBus.on("vote:cast", async (payload) => {
    try {
      // 1. STREAM LAYER (ingestion)
      await processStreamEvent(payload);

      // 2. FRAUD ENGINE (security gate)
      const fraudResult = await runFraudEngine(payload);

      if (fraudResult?.blocked) {
        console.warn("🚫 Fraud detected, stopping pipeline:", payload.userId);
        return;
      }

      // 3. STATE UPDATE (distributed consistency)
      await updateState(payload);

      // 4. AI FUSION ENGINE (decision intelligence)
      const fusion = await runFusionEngine(payload);

      // 5. DEEP LEARNING ENGINE (prediction layer)
      const prediction = await runDeepLearningEngine({
        ...payload,
        fusion,
      });

      // 6. DASHBOARD AI (UI intelligence layer)
      await runDashboardAI({
        ...payload,
        fusion,
        prediction,
      });

      // 7. Emit final intelligence event
      eventBus.emit("erie:analyze:complete", {
        ...payload,
        fusion,
        prediction,
      });
    } catch (err) {
      console.error("❌ ERIE vote pipeline error:", err.message);
    }
  });

  /**
   * =========================
   * ELECTION UPDATES
   * =========================
   */
  eventBus.on("election:update", async (payload) => {
    try {
      await updateState(payload);
      eventBus.emit("erie:election:processed", payload);
    } catch (err) {
      console.error("❌ Election update error:", err.message);
    }
  });

  /**
   * =========================
   * SYSTEM ANALYSIS HOOK
   * =========================
   */
  eventBus.on("erie:analyze:complete", async (payload) => {
    console.log("🧠 ERIE final analysis complete:", payload.electionId);
  });

  /**
   * =========================
   * CLUSTER BOOTSTRAP (v3)
   * =========================
   */
  await bootstrapERIEv3();
}

module.exports = { bootstrapERIEOrchestrator };