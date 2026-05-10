function startHeartbeat(node, broadcast) {
  setInterval(() => {
    if (node.isLeader()) {
      broadcast({
        type: "heartbeat",
        term: node.term,
        leaderId: node.nodeId,
      });
    }
  }, 1000);
}

module.exports = { startHeartbeat };