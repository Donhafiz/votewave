const fs = require("fs");

function appendLog(topic, event) {
  fs.appendFileSync(
    `erie_v4_${topic}.log`,
    JSON.stringify(event) + "\n"
  );
}

module.exports = { appendLog };