function getPartition(key, partitionCount) {
  if (!key) return 0;

  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash + key.charCodeAt(i)) % partitionCount;
  }

  return hash % partitionCount;
}

module.exports = { getPartition };