const fs = require("fs");

function replay(topic) {
  const file = `erie_v4_${topic}.log`;

  if (!fs.existsSync(file)) return [];

  return fs
    .readFileSync(file, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map(JSON.parse);
}

module.exports = { replay };