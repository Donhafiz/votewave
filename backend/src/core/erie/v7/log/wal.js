const fs = require("fs");

class WAL {
  constructor(file) {
    this.file = file;
  }

  append(entry) {
    fs.appendFileSync(this.file, JSON.stringify(entry) + "\n");
  }

  read() {
    const data = fs.readFileSync(this.file, "utf-8").trim();
    if (!data) return [];

    return data.split("\n").map((l) => JSON.parse(l));
  }
}

module.exports = WAL;