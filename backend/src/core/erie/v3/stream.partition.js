function partitionStream(key) {
  return parseInt(String(key).slice(-2)) % 4;
}

module.exports = { partitionStream };