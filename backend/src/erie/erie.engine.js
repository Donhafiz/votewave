const stateStore = require("./state.store");
const mlModel = require("../ml/prediction.ml");

/* =========================================================
   ERIE CORE ENGINE (ML v2)
========================================================= */

async function processElectionIntelligence({
  tenantId,
  electionId,
}) {
  // 1. Load current election state
  const state = await stateStore.getElectionState(
    tenantId,
    electionId
  );

  if (!state) {
    return {
      error: "No election state found",
      tenantId,
      electionId,
    };
  }

  // 2. Run ML v2 prediction engine
  const prediction = mlModel.predictElection(state);

  // 3. Persist intelligence snapshot
  await stateStore.saveIntelligenceSnapshot(
    tenantId,
    electionId,
    prediction
  );

  // 4. Return structured intelligence payload
  return {
    tenantId,
    electionId,
    ...prediction,
  };
}

module.exports = {
  processElectionIntelligence,
};