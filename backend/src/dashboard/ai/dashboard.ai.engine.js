const eventBus = require("../../events/eventBus");

const { aggregateMetrics } = require("./metrics.aggregator");
const { computeHealth } = require("./election.health.model");
const { generateInsights } = require("./insight.generator");

/**
 * DASHBOARD AI v3 ENGINE
 * - Converts raw system data → UI intelligence
 */

async function runDashboardAI(payload) {
  const metrics = await aggregateMetrics(payload);
  const health = computeHealth(metrics);
  const insights = generateInsights(metrics);

  const dashboardPayload = {
    electionId: payload.electionId,
    metrics,
    health,
    insights,
    timestamp: Date.now(),
  };

  eventBus.emit("dashboard:ai:update", dashboardPayload);

  return dashboardPayload;
}

module.exports = { runDashboardAI };