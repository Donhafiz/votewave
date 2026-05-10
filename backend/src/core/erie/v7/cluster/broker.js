const express = require("express");
const RaftNode = require("../raft/node");
const WAL = require("../log/wal");
const Replication = require("./replication");

class BrokerNode {
  constructor({ nodeId, peers }) {
    this.nodeId = nodeId;

    this.raft = new RaftNode(nodeId, peers);
    this.replication = new Replication(peers);

    this.log = new WAL(`./logs/${nodeId}.log`);

    this.app = express();
    this.app.use(express.json());

    this._routes();
  }

  _routes() {
    /* =========================
       PRODUCE EVENT
    ========================== */
    this.app.post("/produce", async (req, res) => {
      const event = {
        ...req.body,
        term: this.raft.term,
        timestamp: Date.now(),
      };

      this.log.append(event);

      if (this.raft.isLeader()) {
        await this.replication.replicate(event, async (peer, ev) => {
          return fetch(`${peer}/replicate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(ev),
          });
        });
      }

      res.json({ success: true, event });
    });

    /* =========================
       REPLICATION ENDPOINT
    ========================== */
    this.app.post("/replicate", (req, res) => {
      this.log.append(req.body);
      res.json({ ok: true });
    });

    /* =========================
       HEARTBEAT
    ========================== */
    this.app.post("/heartbeat", (req, res) => {
      this.raft.receiveHeartbeat(req.body.leaderId, req.body.term);
      res.json({ ok: true });
    });
  }

  start(port) {
    this.app.listen(port, () => {
      console.log(`🚀 ERIE v7 node running on ${port}`);
    });
  }
}

module.exports = BrokerNode;