const axios = require("axios");

/**
 * Leader → Follower replication layer
 */
class ReplicationManager {
  constructor(peers = []) {
    this.peers = peers; // follower nodes
  }

  async replicate(event) {
    const promises = this.peers.map((url) =>
      axios.post(`${url}/replicate`, event).catch(() => null)
    );

    await Promise.allSettled(promises);
  }
}

module.exports = ReplicationManager;