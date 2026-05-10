const mongoose = require("mongoose");

const eventStoreSchema = new mongoose.Schema(
  {
    eventType: {
      type: String,
      required: true,
      index: true,
    },

    aggregateId: {
      type: String,
      required: true,
      index: true,
    },

    aggregateType: {
      type: String,
      required: true,
    },

    tenantId: {
      type: String,
      required: true,
      index: true,
    },

    payload: {
      type: Object,
      required: true,
    },

    metadata: {
      requestId: String,
      ip: String,
      userAgent: String,
      source: String,
    },

    version: {
      type: Number,
      default: 1,
    },

    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

eventStoreSchema.index({
  tenantId: 1,
  eventType: 1,
  timestamp: -1,
});

module.exports = mongoose.model(
  "EventStore",
  eventStoreSchema
);