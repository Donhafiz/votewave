const mongoose = require("mongoose");

const voteSchema = new mongoose.Schema(
  {
    tenantId: {
      type: String,
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

    ip: {
      type: String,
      default: null,
    },

    userAgent: {
      type: String,
      default: null,
    },

    source: {
      type: String,
      enum: ["web", "mobile", "api", "admin"],
      default: "web",
    },

    status: {
      type: String,
      enum: ["pending", "counted", "rejected"],
      default: "counted",
      index: true,
    },

    fraudScore: {
      type: Number,
      default: 0,
    },

    fraudFlags: [
      {
        type: String,
      },
    ],

    metadata: {
      deviceId: String,
      sessionId: String,
      region: String,
      browser: String,
      os: String,
    },

    processedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

/* =========================================================
   CRITICAL UNIQUE VOTE CONSTRAINT
   Prevents duplicate voting at DB level
========================================================= */
voteSchema.index(
  {
    tenantId: 1,
    electionId: 1,
    userId: 1,
  },
  {
    unique: true,
    name: "unique_user_vote_per_election",
  }
);

/* =========================================================
   REALTIME RESULT QUERIES
========================================================= */
voteSchema.index({
  tenantId: 1,
  electionId: 1,
  candidateId: 1,
});

/* =========================================================
   FRAUD ENGINE QUERIES
========================================================= */
voteSchema.index({
  ip: 1,
  electionId: 1,
});

voteSchema.index({
  processedAt: -1,
});

/* =========================================================
   ANALYTICS + ML PIPELINE
========================================================= */
voteSchema.index({
  tenantId: 1,
  createdAt: -1,
});

/* =========================================================
   TRANSFORM OUTPUT
========================================================= */
voteSchema.set("toJSON", {
  transform: function (_, ret) {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("Vote", voteSchema);