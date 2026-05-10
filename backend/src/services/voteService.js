const Vote = require("../models/Vote");
const Election = require("../models/Election");
const Candidate = require("../models/Candidate");

/* =========================================================
   ERIE v5 PRODUCER (DISTRIBUTED EVENT SYSTEM)
========================================================= */
const Producer = require("../core/erie/v5/producer");
const producer = new Producer(process.env.ERIE_LEADER_URL || "http://localhost:5001");

/* =========================================================
   ML v5 INFERENCE CLIENT (PYTHON BRIDGE)
========================================================= */
const { execFile } = require("child_process");
const path = require("path");

/* =========================================================
   RUN ML FRAUD PREDICTION
========================================================= */
function runFraudModel(input) {
  return new Promise((resolve, reject) => {
    const script = path.join(__dirname, "../ml/v5/inference/predictor.py");

    execFile("python", [script, JSON.stringify(input)], (err, stdout) => {
      if (err) return reject(err);

      try {
        const result = JSON.parse(stdout);
        resolve(result.fraudProbability);
      } catch (e) {
        reject(e);
      }
    });
  });
}

/* =========================================================
   CAST VOTE (FULL PIPELINE)
========================================================= */
async function castVote({
  tenantId,
  userId,
  electionId,
  candidateId,
  ip,
  userAgent,
  requestId,
}) {
  try {
    /* =========================
       1. VALIDATION
    ========================== */
    const election = await Election.findById(electionId);

    if (!election || election.status !== "active") {
      return { success: false, message: "Election not active" };
    }

    const existingVote = await Vote.findOne({ userId, electionId });

    if (existingVote) {
      return { success: false, message: "Already voted" };
    }

    const candidate = await Candidate.findById(candidateId);

    if (!candidate) {
      return { success: false, message: "Candidate not found" };
    }

    /* =========================
       2. ML FEATURE ENGINEERING
    ========================== */
    const mlInput = {
      userRiskScore: 0.5,
      voteVelocity: 1,
      ipReputation: 0.2,
      deviceEntropy: 0.3,
      electionActivity: 0.6,
      timeDelta: Date.now(),
    };

    const fraudScore = await runFraudModel(mlInput);

    /* =========================
       3. BLOCK HIGH RISK VOTES
    ========================== */
    if (fraudScore > 0.85) {
      return {
        success: false,
        message: "Vote blocked by fraud detection",
        fraudScore,
      };
    }

    /* =========================
       4. SAVE VOTE
    ========================== */
    const vote = await Vote.create({
      tenantId,
      userId,
      electionId,
      candidateId,
      ipAddress: ip,
      userAgent,
      requestId,
      fraudScore,
      timestamp: new Date(),
    });

    /* =========================
       5. ERIE v5 EVENT PIPELINE
    ========================== */

    // CORE VOTE EVENT
    await producer.send("vote.cast", userId, {
      voteId: vote._id,
      electionId,
      candidateId,
      tenantId,
    });

    // FRAUD PIPELINE
    await producer.send("fraud.check", userId, {
      userId,
      ip,
      fraudScore,
      electionId,
    });

    // ML FEEDBACK LOOP
    await producer.send("ml.update", userId, {
      electionId,
      candidateId,
      fraudScore,
    });

    // ANALYTICS STREAM
    await producer.send("analytics.event", userId, {
      type: "vote",
      electionId,
      candidateId,
    });

    /* =========================
       6. RESPONSE
    ========================== */
    return {
      success: true,
      message: "Vote cast successfully",
      data: vote,
      fraudScore,
    };
  } catch (error) {
    return {
      success: false,
      message: error.message,
    };
  }
}

/* =========================================================
   ANALYTICS
========================================================= */
async function getVotes({ electionId }) {
  const votes = await Vote.find({ electionId });

  return {
    success: true,
    count: votes.length,
    data: votes,
  };
}

async function getVoteStats({ electionId }) {
  const stats = await Vote.aggregate([
    { $match: { electionId } },
    {
      $group: {
        _id: "$candidateId",
        totalVotes: { $sum: 1 },
      },
    },
  ]);

  return {
    success: true,
    data: stats,
  };
}

/* =========================================================
   EXPORTS
========================================================= */
module.exports = {
  castVote,
  getVotes,
  getVoteStats,
};