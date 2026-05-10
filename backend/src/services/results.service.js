const {
  getResults,
} = require("../data/cache/result.cache");

async function getLiveResults(
  tenantId,
  electionId
) {
  return await getResults(
    tenantId,
    electionId
  );
}

module.exports = {
  getLiveResults,
};