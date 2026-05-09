const Vote = require("../models/Vote");
const crypto = require("crypto");
const eventBus = require("../events/eventBus");

async function castVote({
  tenantId,
  userId,
  electionId,
  candidateId,
  ip,
  userAgent,
}) {
  // 1. create idempotency fingerprint
  const fingerprint = crypto
    .createHash("sha256")
    .update(`${tenantId}-${userId}-${electionId}`)
    .digest("hex");

  // 2. prevent duplicate vote (hard guarantee)
  const existing = await Vote.findOne({ fingerprint });
  if (existing) {
    return { skipped: true, reason: "ALREADY_VOTED" };
  }

  // 3. create vote
  const vote = await Vote.create({
    tenantId,
    userId,
    electionId,
    candidateId,
    fingerprint,
    metadata: { ip, userAgent },
  });

  // 4. emit domain event (NOT socket here)
  eventBus.emit("VOTE_CAST", {
    tenantId,
    electionId,
    candidateId,
  });

  return { success: true, vote };
}

module.exports = {
  castVote,
};