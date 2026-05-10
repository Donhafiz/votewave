// processors/ml.processor.js
const { spawn } = require("child_process");

module.exports = async function mlProcessor(payload) {
  return new Promise((resolve) => {
    const py = spawn("python", [
      "src/ml/v5/inference/predictor.py",
      JSON.stringify(payload),
    ]);

    let data = "";

    py.stdout.on("data", (chunk) => {
      data += chunk.toString();
    });

    py.on("close", () => {
      try {
        const result = JSON.parse(data);
        console.log("🧠 ML prediction:", result);
        resolve(result);
      } catch {
        resolve(null);
      }
    });
  });
};