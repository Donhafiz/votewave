// src/core/erie/v4/broker/partitioner.js

function getPartition(key, partitions = 4) {
  if (!key) return 0;

  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) % 100000;
  }

  return hash % partitions;
}

module.exports = { getPartition };