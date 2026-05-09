function getShardId(electionId, shardCount = 4) {
  const hash = [...String(electionId)].reduce(
    (acc, c) => acc + c.charCodeAt(0),
    0
  );

  return hash % shardCount;
}

function getQueueName(electionId) {
  const shard = getShardId(electionId);
  return `vote-queue:shard:${shard}`;
}

module.exports = {
  getShardId,
  getQueueName,
};