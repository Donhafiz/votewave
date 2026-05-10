// src/core/erie/v4/broker/topic.js
const STREAM_PREFIX = "erie:topic";

function getTopicKey(topic) {
  return `${STREAM_PREFIX}:${topic}`;
}

module.exports = { getTopicKey };