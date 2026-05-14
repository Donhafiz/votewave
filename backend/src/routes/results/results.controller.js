const redis = require("../../config/redis");

async function getRealtimeResults(req, res) {
  const { tenantId, electionId } = req.params;

  const key = `projection:${tenantId}:${electionId}`;

  const results = await redis.hGetAll(key);

  res.json({
    success: true,
    realtime: true,
    results,
  });
}

module.exports = {
  getRealtimeResults,
};