const fs = require("fs");
const path = require("path");

class OffsetStore {
  constructor(nodeId) {
    this.file = path.join(__dirname, `../../logs/offset-${nodeId}.json`);

    if (!fs.existsSync(this.file)) {
      fs.writeFileSync(this.file, JSON.stringify({}));
    }
  }

  get() {
    return JSON.parse(fs.readFileSync(this.file));
  }

  set(consumer, offset) {
    const data = this.get();
    data[consumer] = offset;
    fs.writeFileSync(this.file, JSON.stringify(data));
  }
}

module.exports = OffsetStore;