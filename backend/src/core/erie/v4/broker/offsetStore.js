// src/core/erie/v4/broker/offsetStore.js
const offsets = new Map();

/**
 * format:
 * group:topic:partition → lastProcessedId
 */

function commitOffset(group, topic, partition, offset) {
  offsets.set(`${group}:${topic}:${partition}`, offset);
}

function getOffset(group, topic, partition) {
  return offsets.get(`${group}:${topic}:${partition}`) || "0";
}

module.exports = {
  commitOffset,
  getOffset,
};