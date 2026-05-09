function partition(key, partitions = 4) {
  return Math.abs(
    key.split("").reduce((a, c) => a + c.charCodeAt(0), 0)
  ) % partitions;
}

module.exports = { partition };