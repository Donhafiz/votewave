let model;

/**
 * Lazy-load TensorFlow model
 */
async function loadModel() {
  if (model) return model;

  const tf = require("@tensorflow/tfjs-node");

  model = await tf.loadLayersModel(
    "file://ml/v5/tensor-model/model.json"
  );

  return model;
}

async function runInference(input) {
  const tf = require("@tensorflow/tfjs-node");

  const model = await loadModel();

  const tensor = tf.tensor2d([input]);

  const prediction = model.predict(tensor);

  const value = prediction.dataSync()[0];

  return {
    probability: value,
  };
}

module.exports = { runInference };