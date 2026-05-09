const fs = require("fs");
const path = require("path");

/**
 * ML v4 MODEL TRAINER
 * -------------------
 * - Learns from stored election datasets
 * - Produces updated weight model
 * - Used by deep.engine.js for prediction tuning
 */

const DATASET_PATH = path.join(__dirname, "dataset.store.json");
const MODEL_PATH = path.join(__dirname, "trained.model.json");

/**
 * Load dataset
 */
function loadDataset() {
  if (!fs.existsSync(DATASET_PATH)) return [];

  return JSON.parse(fs.readFileSync(DATASET_PATH, "utf-8"));
}

/**
 * Simple feature-weight training (v4 baseline model)
 * - Calculates influence weights from historical outcomes
 */
function trainModel() {
  const dataset = loadDataset();

  if (dataset.length < 10) {
    console.warn("⚠ Not enough data to train model. Using default weights.");
    return {
      dominanceWeight: 0.7,
      competitivenessWeight: 0.3,
      bias: 0.0,
    };
  }

  let dominanceSum = 0;
  let competitivenessSum = 0;

  let count = 0;

  for (const entry of dataset) {
    const features = entry.features;
    const prediction = entry.prediction;

    if (!features || !prediction) continue;

    dominanceSum += features.leaderVotes / (features.totalVotes || 1);
    competitivenessSum += features.spread / (features.totalVotes || 1);

    count++;
  }

  const model = {
    dominanceWeight: dominanceSum / count,
    competitivenessWeight: 1 - competitivenessSum / count,
    bias: Math.random() * 0.05, // small adaptive drift factor
    trainedAt: new Date().toISOString(),
    samples: count,
  };

  fs.writeFileSync(MODEL_PATH, JSON.stringify(model, null, 2));

  console.log("🧠 ML v4 model trained:", model);

  return model;
}

/**
 * Load trained model
 */
function loadModel() {
  if (!fs.existsSync(MODEL_PATH)) {
    return trainModel();
  }

  return JSON.parse(fs.readFileSync(MODEL_PATH, "utf-8"));
}

/**
 * Predict using trained weights
 */
function predict(features) {
  const model = loadModel();

  const dominance =
    (features.leaderVotes / (features.totalVotes || 1)) *
    model.dominanceWeight;

  const competitiveness =
    (features.spread / (features.totalVotes || 1)) *
    model.competitivenessWeight;

  let score = dominance + (1 - competitiveness) + model.bias;

  // normalize to 0–1
  score = Math.max(0, Math.min(1, score));

  return {
    winnerProbability: score,
    modelUsed: model.trainedAt,
  };
}

module.exports = {
  trainModel,
  loadModel,
  predict,
};