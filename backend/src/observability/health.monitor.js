const os = require("os");

/* =========================================================
   HEALTH MONITOR
========================================================= */

function getSystemHealth() {
  return {
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cpuLoad: os.loadavg(),
    platform: process.platform,
    nodeVersion: process.version,
    timestamp: new Date(),
  };
}

module.exports = {
  getSystemHealth,
};