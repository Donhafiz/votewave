const eventBus = require("../../events/eventBus");
const { encodeFeatures } = require("./feature.encoder");
const { runInference } = require("./inference.service");
const { trainModel } = require("./trainer.tfjs");

/**
 * ML v5 NEURAL ENGINE
 * -------------------
 * - encodes features into tensor input
 * - runs neural inference
 * - triggers adaptive training
 */

async function runNeuralEngine(payload) {
  const encoded = encodeFeatures(payload);

  const prediction = await runInference(encoded);

  // auto-learning trigger (online learning concept)
  if (Math.random() > 0.85) {
    trainModel(encoded, prediction);
  }

  eventBus.emit("ml:v5:prediction", {
    ...payload,
    prediction,
  });

  return prediction;
}

module.exports = { runNeuralEngine };