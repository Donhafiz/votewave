const fs = require("fs");

function replayStream(partition) {
  const file = `stream_partition_${partition}.log`;

  if (!fs.existsSync(file)) return [];

  const data = fs.readFileSync(file, "utf-8");

  return data.trim().split("\n").map(JSON.parse);
}

module.exports = { replayStream };