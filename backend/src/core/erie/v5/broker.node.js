const express = require("express");
const LogStore = require("./log.store");
const ReplicationManager = require("./replication.manager");

class BrokerNode {
  constructor({ nodeId, role, peers = [] }) {
    this.nodeId = nodeId;
    this.role = role; // leader | follower

    this.log = new LogStore(nodeId);
    this.replication = new ReplicationManager(peers);

    this.app = express();
    this.app.use(express.json());

    this._setupRoutes();
  }

  _setupRoutes() {
    /* =========================
       PRODUCE EVENT (LEADER ONLY)
    ========================== */
    this.app.post("/produce", async (req, res) => {
      const event = {
        ...req.body,
        timestamp: Date.now(),
        offset: this.log.readAll().length,
      };

      this.log.append(event);

      // replicate to followers
      if (this.role === "leader") {
        await this.replication.replicate(event);
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
       READ LOG (REPLAY)
    ========================== */
    this.app.get("/log", (req, res) => {
      res.json(this.log.readAll());
    });
  }

  start(port) {
    this.app.listen(port, () => {
      console.log(
        `🚀 ERIE v5 ${this.role.toUpperCase()} node running on port ${port}`
      );
    });
  }
}

module.exports = BrokerNode;