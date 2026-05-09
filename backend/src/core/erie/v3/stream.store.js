const fs = require("fs");

function storeEvent(partition, event) {
  const file = `stream_partition_${partition}.log`;

  fs.appendFileSync(file, JSON.stringify(event) + "\n");
}

module.exports = { storeEvent };