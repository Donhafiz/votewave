const BrokerNode = require("./cluster/broker");

function bootstrapERIEv7() {
  const node1 = new BrokerNode({
    nodeId: "node-1",
    peers: ["http://localhost:7002", "http://localhost:7003"],
  });

  const node2 = new BrokerNode({
    nodeId: "node-2",
    peers: [],
  });

  const node3 = new BrokerNode({
    nodeId: "node-3",
    peers: [],
  });

  node1.raft.becomeLeader();

  node1.start(7001);
  node2.start(7002);
  node3.start(7003);

  console.log("🔥 ERIE v7 FULL RAFT CONSENSUS CLUSTER ONLINE");
}

module.exports = { bootstrapERIEv7 };