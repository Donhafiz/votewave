const { publish } = require("./producer");
const { createConsumerGroup } = require("./consumerGroup");
const Topics = require("./topics");

/* =========================================================
   START ERIE v4 CLUSTER
========================================================= */
function bootstrapERIEv4() {
  console.log("🚀 ERIE v4 Kafka-style system starting...");

  // FRAUD WORKER GROUP
  createConsumerGroup("fraud-group", (event) => {
    if (event.topic === Topics.FRAUD_CHECK) {
      console.log("🚨 Fraud Worker:", event.payload);
    }
  });

  // ML WORKER GROUP
  createConsumerGroup("ml-group", (event) => {
    if (event.topic === Topics.ML_UPDATE) {
      console.log("🧠 ML Worker:", event.payload);
    }
  });

  // ANALYTICS GROUP
  createConsumerGroup("analytics-group", (event) => {
    if (event.topic === Topics.ANALYTICS_EVENT) {
      console.log("📊 Analytics:", event.payload);
    }
  });

  console.log("✅ ERIE v4 running (Kafka-style distributed backbone)");
}

module.exports = {
  bootstrapERIEv4,
  publish,
};