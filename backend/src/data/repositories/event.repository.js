const EventStore = require("../../models/EventStore");

async function appendEvent(event) {
  return await EventStore.create(event);
}

async function getEventsByAggregate(
  aggregateId
) {
  return await EventStore.find({
    aggregateId,
  }).sort({ timestamp: 1 });
}

module.exports = {
  appendEvent,
  getEventsByAggregate,
};