function getPartition(key, partitions = 6) {
  if (!key) return 0;

  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) % partitions;
  }

  return Math.abs(hash) % partitions;
}

module.exports = { getPartition };