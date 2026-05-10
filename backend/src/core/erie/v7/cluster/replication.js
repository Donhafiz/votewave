class Replication {
  constructor(peers = []) {
    this.peers = peers;
  }

  async replicate(event, sendFn) {
    const results = await Promise.allSettled(
      this.peers.map((p) => sendFn(p, event))
    );

    const success = results.filter((r) => r.status === "fulfilled").length;

    const quorum = Math.floor(this.peers.length / 2) + 1;

    if (success < quorum) {
      throw new Error("Replication quorum failed");
    }

    return true;
  }
}

module.exports = Replication;