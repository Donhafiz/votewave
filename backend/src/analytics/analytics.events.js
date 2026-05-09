const eventBus = require("../sockets/events/eventBus");

/* =========================================================
   ANALYTICS EVENT PRODUCER
========================================================= */

function trackVoteEvent(payload) {
  eventBus.emit("analytics:vote", {
    type: "vote",
    ...payload,
    timestamp: Date.now(),
  });
}

function trackElectionEvent(payload) {
  eventBus.emit("analytics:election", {
    type: "election",
    ...payload,
    timestamp: Date.now(),
  });
}

function trackUserEvent(payload) {
  eventBus.emit("analytics:user", {
    type: "user",
    ...payload,
    timestamp: Date.now(),
  });
}

module.exports = {
  trackVoteEvent,
  trackElectionEvent,
  trackUserEvent,
};