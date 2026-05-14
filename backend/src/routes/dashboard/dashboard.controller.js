const dashboardService = require("./dashboard.service");

/**
 * GET /api/dashboard/live
 */
async function getLiveDashboard(req, res) {
  try {
    const { tenantId, electionId } = req.params;

    const data = await dashboardService.getLiveDashboard({
      tenantId,
      electionId,
    });

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
}

module.exports = {
  getLiveDashboard,
};