const mongoose = require("mongoose");

const electionResultSchema = new mongoose.Schema(
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

    voteCount: {
      type: Number,
      default: 0,
    },

    lastUpdated: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

/* =========================================================
   FAST LOOKUP INDEX
========================================================= */
electionResultSchema.index(
  { tenantId: 1, electionId: 1, candidateId: 1 },
  { unique: true }
);

module.exports = mongoose.model("ElectionResult", electionResultSchema);