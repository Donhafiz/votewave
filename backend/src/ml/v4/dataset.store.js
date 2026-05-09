const fs = require("fs");
const path = require("path");

/**
 * Stores training data for future ML improvement
 */

async function storeDataset(entry) {
  const file = path.join(__dirname, "training.dataset.json");

  const data = fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file))
    : [];

  data.push({
    ...entry,
    timestamp: Date.now(),
  });

  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

module.exports = { storeDataset };