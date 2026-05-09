const broker = require("./broker");

function produceEvent(topic, event) {
  broker.send(topic, event);
}

module.exports = { produceEvent };