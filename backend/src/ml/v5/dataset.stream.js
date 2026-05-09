const fs = require("fs");

function storeTrainingData(data) {
  fs.appendFileSync(
    "ml/v5/dataset.log",
    JSON.stringify(data) + "\n"
  );
}

module.exports = { storeTrainingData };