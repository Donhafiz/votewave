const BrokerNode = require("./cluster.node");

function bootstrapERIEv6() {
  const node1 = new BrokerNode({
    nodeId: "node-1",
    peers: ["http://localhost:6002", "http://localhost:6003"],
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

  node1.start(6001);
  node2.start(6002);
  node3.start(6003);

  console.log("🔥 ERIE v6 DISTRIBUTED CLUSTER ONLINE");
}

module.exports = { bootstrapERIEv6 };