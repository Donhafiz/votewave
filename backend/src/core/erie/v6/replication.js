const axios = require("axios");

class Replication {
  constructor(peers = [], quorum = 2) {
    this.peers = peers;
    this.quorum = quorum;
  }

  async replicate(event) {
    const results = await Promise.allSettled(
      this.peers.map((url) =>
        axios.post(`${url}/replicate`, event).catch(() => null)
      )
    );

    const success = results.filter((r) => r.status === "fulfilled").length;

    if (success < this.quorum) {
      throw new Error("Replication quorum not met");
    }
  }
}

module.exports = Replication;