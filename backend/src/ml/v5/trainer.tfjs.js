const tf = require("@tensorflow/tfjs-node");

/**
 * SIMPLE NEURAL NETWORK TRAINER (v5 baseline)
 */
function createModel() {
  const model = tf.sequential();

  model.add(tf.layers.dense({ inputShape: [3], units: 8, activation: "relu" }));
  model.add(tf.layers.dense({ units: 4, activation: "relu" }));
  model.add(tf.layers.dense({ units: 1, activation: "sigmoid" }));

  model.compile({
    optimizer: "adam",
    loss: "binaryCrossentropy",
  });

  return model;
}

async function trainModel(input, label) {
  const model = createModel();

  const xs = tf.tensor2d([input]);
  const ys = tf.tensor2d([[label?.probability || 0]]);

  await model.fit(xs, ys, {
    epochs: 5,
  });

  await model.save("file://ml/v5/tensor-model");

  console.log("🧠 ML v5 model updated");

  return true;
}

module.exports = { trainModel };