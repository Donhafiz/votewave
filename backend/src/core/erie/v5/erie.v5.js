const BrokerNode = require("./broker.node");

/**
 * SIMPLE 3-NODE CLUSTER
 * (1 leader + 2 followers)
 */
function bootstrapERIEv5() {
  const leader = new BrokerNode({
    nodeId: "node-1",
    role: "leader",
    peers: ["http://localhost:5002", "http://localhost:5003"],
  });

  const follower1 = new BrokerNode({
    nodeId: "node-2",
    role: "follower",
  });

  const follower2 = new BrokerNode({
    nodeId: "node-3",
    role: "follower",
  });

  leader.start(5001);
  follower1.start(5002);
  follower2.start(5003);

  console.log("🔥 ERIE v5 CLUSTER ONLINE (Kafka-grade distributed system)");
}

module.exports = { bootstrapERIEv5 };