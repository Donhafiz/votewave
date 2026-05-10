const tf = require("@tensorflow/tfjs-node");

/* =========================================================
   ML v5 TENSOR MODEL
   ---------------------------------------------------------
   Deep Neural Network Architecture for:
   - election prediction
   - turnout forecasting
   - anomaly probability scoring
   - trend intelligence
========================================================= */

function buildTensorModel() {
  const model = tf.sequential();

  /* =====================================================
     INPUT LAYER
     Features Example:
     [
       totalVotes,
       turnoutRate,
       leaderMargin,
       voteVelocity,
       fraudScore,
       engagementRate
     ]
  ===================================================== */

  model.add(
    tf.layers.dense({
      inputShape: [6],
      units: 64,
      activation: "relu",
    })
  );

  /* =====================================================
     HIDDEN LAYER 1
  ===================================================== */

  model.add(
    tf.layers.dropout({
      rate: 0.2,
    })
  );

  model.add(
    tf.layers.dense({
      units: 32,
      activation: "relu",
    })
  );

  /* =====================================================
     HIDDEN LAYER 2
  ===================================================== */

  model.add(
    tf.layers.dropout({
      rate: 0.15,
    })
  );

  model.add(
    tf.layers.dense({
      units: 16,
      activation: "relu",
    })
  );

  /* =====================================================
     OUTPUT LAYER
     0 → low probability
     1 → high probability
  ===================================================== */

  model.add(
    tf.layers.dense({
      units: 1,
      activation: "sigmoid",
    })
  );

  /* =====================================================
     COMPILE MODEL
  ===================================================== */

  model.compile({
    optimizer: tf.train.adam(0.001),

    loss: "binaryCrossentropy",

    metrics: [
      "accuracy",
    ],
  });

  console.log("🧠 ML v5 Tensor Model Initialized");

  return model;
}

/* =========================================================
   SAVE MODEL
========================================================= */

async function saveTensorModel(model) {
  await model.save(
    "file://ml/v5/tensor-model"
  );

  console.log("💾 Tensor model saved");
}

/* =========================================================
   LOAD MODEL
========================================================= */

async function loadTensorModel() {
  try {
    const model = await tf.loadLayersModel(
      "file://ml/v5/tensor-model/model.json"
    );

    console.log("📦 Tensor model loaded");

    return model;
  } catch (err) {
    console.warn(
      "⚠ No trained model found — building fresh model"
    );

    return buildTensorModel();
  }
}

/* =========================================================
   PREDICT
========================================================= */

async function predict(model, inputData) {
  const tensor = tf.tensor2d([inputData]);

  const prediction = model.predict(tensor);

  const value = prediction.dataSync()[0];

  return {
    probability: Number(value.toFixed(4)),
    confidence:
      value > 0.8
        ? "high"
        : value > 0.5
        ? "medium"
        : "low",
  };
}

module.exports = {
  buildTensorModel,
  saveTensorModel,
  loadTensorModel,
  predict,
};