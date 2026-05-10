const fs = require("fs");
const path = require("path");

class LogStore {
  constructor(nodeId) {
    this.file = path.join(__dirname, `../../logs/erie-${nodeId}.log`);

    if (!fs.existsSync(this.file)) {
      fs.writeFileSync(this.file, "");
    }
  }

  append(record) {
    fs.appendFileSync(this.file, JSON.stringify(record) + "\n");
  }

  readAll() {
    const data = fs.readFileSync(this.file, "utf-8").trim();
    if (!data) return [];

    return data.split("\n").map((line) => JSON.parse(line));
  }
}

module.exports = LogStore;