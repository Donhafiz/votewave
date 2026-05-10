class RaftNode {
  constructor(nodeId, peers = []) {
    this.nodeId = nodeId;
    this.peers = peers;

    this.term = 0;
    this.votedFor = null;
    this.isLeader = false;
  }

  becomeLeader() {
    this.isLeader = true;
    console.log(`👑 Node ${this.nodeId} became LEADER (term ${this.term})`);
  }

  stepDown() {
    this.isLeader = false;
  }

  heartbeat() {
    this.term += 1;
  }
}

module.exports = RaftNode;