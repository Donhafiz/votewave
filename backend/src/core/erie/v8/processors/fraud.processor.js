// processors/fraud.processor.js
module.exports = async function fraudProcessor(payload) {
  const risk =
    (payload.ipScore || 0) +
    (payload.behaviorScore || 0);

  if (risk > 70) {
    console.log("🚨 Fraud risk detected:", payload);
  }
};