const mongoose = require("mongoose");

const voteSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    electionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Election",
      required: true,
      index: true,
    },

    candidateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Candidate",
      required: true,
      index: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // prevents duplicate voting at DB level
    fingerprint: {
      type: String,
      required: true,
      unique: true,
    },

    metadata: {
      ip: String,
      userAgent: String,
      deviceId: String,
    },
  },
  { timestamps: true }
);

/* =========================================================
   CRITICAL INDEXES (SAAS SCALE)
========================================================= */
voteSchema.index({ tenantId: 1, electionId: 1 });
voteSchema.index({ tenantId: 1, userId: 1, electionId: 1 }, { unique: true });

module.exports = mongoose.model("Vote", voteSchema);