class RaftNode {
  constructor(nodeId, peers = []) {
    this.nodeId = nodeId;
    this.peers = peers;

    this.term = 0;
    this.votedFor = null;

    this.role = "follower"; // follower | candidate | leader

    this.leaderId = null;
    this.lastHeartbeat = Date.now();
  }

  becomeFollower(term) {
    this.role = "follower";
    this.term = term;
    this.votedFor = null;
  }

  becomeCandidate() {
    this.role = "candidate";
    this.term += 1;
    this.votedFor = this.nodeId;
  }

  becomeLeader() {
    this.role = "leader";
    this.leaderId = this.nodeId;
    console.log(`👑 LEADER ELECTED: ${this.nodeId} (term ${this.term})`);
  }

  receiveHeartbeat(leaderId, term) {
    if (term >= this.term) {
      this.term = term;
      this.leaderId = leaderId;
      this.role = "follower";
      this.lastHeartbeat = Date.now();
    }
  }

  isLeader() {
    return this.role === "leader";
  }
}

module.exports = RaftNode;