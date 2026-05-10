const fs = require("fs");
const path = require("path");

class LogSegment {
  constructor(nodeId, partition) {
    this.file = path.join(
      __dirname,
      `../../logs/v6-${nodeId}-${partition}.log`
    );

    if (!fs.existsSync(this.file)) {
      fs.writeFileSync(this.file, "");
    }
  }

  append(record) {
    fs.appendFileSync(this.file, JSON.stringify(record) + "\n");
  }

  read(offset = 0) {
    const data = fs.readFileSync(this.file, "utf-8").trim();
    if (!data) return [];

    return data
      .split("\n")
      .map((l) => JSON.parse(l))
      .slice(offset);
  }
}

module.exports = LogSegment;