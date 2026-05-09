const eventBus = require("../../events/eventBus");

const { buildFeatures } = require("./feature.builder");
const { predict } = require("./prediction.core");
const { storeDataset } = require("./dataset.store");
const { feedbackLoop } = require("./feedback.loop");

/**
 * ML v4 DEEP LEARNING ENGINE
 * --------------------------
 * - Feature extraction
 * - Prediction
 * - Continuous learning loop
 */

async function runDeepLearningEngine(payload) {
  const features = await buildFeatures(payload);

  const prediction = await predict(features);

  // store training data (for future learning)
  await storeDataset({ payload, features, prediction });

  // adaptive improvement hook
  await feedbackLoop({ payload, prediction });

  const result = {
    electionId: payload.electionId,
    prediction,
    features,
    timestamp: Date.now(),
  };

  eventBus.emit("ml:v4:prediction", result);

  return result;
}

module.exports = { runDeepLearningEngine };