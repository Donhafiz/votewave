const eventBus = require("../../events/eventBus");

const {
  appendEvent,
} = require("../repositories/event.repository");

async function publishVoteEvent(payload) {
  // 1. persist event
  await appendEvent({
    eventType: "vote.cast",
    aggregateId: payload.electionId,
    aggregateType: "Election",
    tenantId: payload.tenantId,

    payload,

    metadata: {
      ip: payload.ip,
      userAgent: payload.userAgent,
      source: payload.source || "web",
    },
  });

  // 2. emit realtime event
  eventBus.emit("vote:cast", payload);
}

module.exports = {
  publishVoteEvent,
};