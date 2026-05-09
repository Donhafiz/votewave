const { Queue } = require("bullmq");
const connection = require("../config/redis");

/**
 * Creates partitioned queues per tenant/election
 */
function getQueue(baseName, partitionKey) {
  return new Queue(`${baseName}:${partitionKey}`, {
    connection,
  });
}

module.exports = { getQueue };