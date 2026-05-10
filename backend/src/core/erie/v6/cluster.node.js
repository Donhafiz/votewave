const express = require("express");
const RaftNode = require("./raft");
const LogSegment = require("./log.segment");
const Replication = require("./replication");
const { getPartition } = require("./partitioner");

class BrokerNode {
  constructor({ nodeId, peers = [] }) {
    this.nodeId = nodeId;

    this.raft = new RaftNode(nodeId, peers);
    this.replication = new Replication(peers, 2);

    this.logs = new Map();

    this.app = express();
    this.app.use(express.json());

    this._routes();
  }

  _getLog(partition) {
    if (!this.logs.has(partition)) {
      this.logs.set(partition, new LogSegment(this.nodeId, partition));
    }
    return this.logs.get(partition);
  }

  _routes() {
    /* PRODUCE */
    this.app.post("/produce", async (req, res) => {
      const { topic, key, payload } = req.body;

      const partition = getPartition(key);

      const event = {
        topic,
        key,
        payload,
        partition,
        term: this.raft.term,
        timestamp: Date.now(),
      };

      this._getLog(partition).append(event);

      if (this.raft.isLeader) {
        await this.replication.replicate(event);
      }

      res.json({ success: true, event });
    });

    /* REPLICATION */
    this.app.post("/replicate", (req, res) => {
      const { partition } = req.body;

      this._getLog(partition).append(req.body);

      res.json({ ok: true });
    });

    /* READ LOG */
    this.app.get("/log/:partition", (req, res) => {
      const data = this._getLog(req.params.partition).read();
      res.json(data);
    });
  }

  start(port) {
    this.app.listen(port, () => {
      console.log(`🚀 ERIE v6 node running on ${port}`);
    });
  }
}

module.exports = BrokerNode;