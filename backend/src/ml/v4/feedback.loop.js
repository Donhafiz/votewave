const eventBus = require("../../events/eventBus");

/**
 * SELF-IMPROVEMENT LOOP
 * (placeholder for reinforcement learning later)
 */

async function feedbackLoop({ prediction }) {
  if (prediction?.winnerProbability > 0.9) {
    eventBus.emit("ml:v4:high-confidence", prediction);
  }

  return true;
}

module.exports = { feedbackLoop };