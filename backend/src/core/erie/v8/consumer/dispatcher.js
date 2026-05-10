// consumer/dispatcher.js
const voteProcessor = require("../processors/vote.processor");
const fraudProcessor = require("../processors/fraud.processor");
const mlProcessor = require("../processors/ml.processor");
const analyticsProcessor = require("../processors/analytics.processor");

async function dispatch(event) {
  switch (event.topic) {
    case "votes":
      return voteProcessor(event.payload);

    case "fraud":
      return fraudProcessor(event.payload);

    case "ml":
      return mlProcessor(event.payload);

    case "analytics":
      return analyticsProcessor(event.payload);

    default:
      console.log("Unknown topic:", event.topic);
  }
}

module.exports = dispatch;