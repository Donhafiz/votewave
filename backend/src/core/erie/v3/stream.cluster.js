const { createClient } = require("redis");
const eventBus = require("../../../events/eventBus");
const { createERIEWorker } = require("../erie.processor");

// 🧠 ML v5 ENGINE (NEW INTEGRATION)
const { runMLv5 } = require("../../../ml/v5/ml.v5.engine");

/* =========================================================
   REDIS STREAM CLIENT
========================================================= */
const redis = createClient({
  url: process.env.REDIS_URL,
});

redis.on("error", (err) => {
  console.error("❌ ERIE Redis Error:", err.message);
});

/* =========================================================
   STREAM CONFIG
========================================================= */
const STREAM_KEY = "erie:stream";
const GROUP = "erie-group";

/* =========================================================
   INIT STREAM GROUP
========================================================= */
async function initStreamGroup() {
  try {
    await redis.connect();

    await redis.xGroupCreate(STREAM_KEY, GROUP, "0", {
      MKSTREAM: true,
    });

    console.log("📡 ERIE v3 Stream Group ready");
  } catch (err) {
    if (!err.message.includes("BUSYGROUP")) {
      console.error("Stream init error:", err.message);
    }
  }
}

/* =========================================================
   PRODUCER
========================================================= */
async function publishEvent(type, payload) {
  await redis.xAdd(STREAM_KEY, "*", {
    type,
    data: JSON.stringify(payload),
    timestamp: Date.now(),
  });
}

/* =========================================================
   ML v5 INTEGRATION PIPELINE (NEW CORE LOGIC)
========================================================= */
async function handleMLPipeline(payload) {
  try {
    const mlResult = await runMLv5({
      userRiskScore: payload.userRiskScore || 0,
      voteVelocity: payload.voteVelocity || 1,
      ipReputation: payload.ipReputation || 0,
      deviceEntropy: payload.deviceEntropy || 0,
      electionActivity: payload.electionActivity || 1,
      timeDelta: payload.timeDelta || 0,
    });

    // 🚨 FRAUD DETECTION
    if (mlResult.isFraud) {
      eventBus.emit("fraud:alert", {
        ...payload,
        fraudScore: mlResult.fraudScore,
      });
    }

    // 📊 FEED ANALYTICS
    eventBus.emit("analytics:event", {
      type: "ml_prediction",
      electionId: payload.electionId,
      candidateId: payload.candidateId,
      fraudScore: mlResult.fraudScore,
    });

    return mlResult;
  } catch (err) {
    console.error("ML pipeline error:", err.message);
    return null;
  }
}

/* =========================================================
   STREAM CONSUMER (SHARDED)
========================================================= */
async function startConsumer(shardId = 0, shardCount = 4) {
  await initStreamGroup();

  console.log(`🧠 ERIE Worker ${shardId} started`);

  while (true) {
    try {
      const results = await redis.xReadGroup(
        GROUP,
        `worker-${shardId}`,
        {
          key: STREAM_KEY,
          id: ">",
        },
        {
          COUNT: 10,
          BLOCK: 5000,
        }
      );

      if (!results) continue;

      for (const stream of results) {
        for (const message of stream.messages) {
          const { type, data } = message.message;

          const payload = JSON.parse(data);

          // 🔥 SHARDING LOGIC
          const hash =
            (payload.electionId || payload.userId || "").length %
            shardCount;

          if (hash !== shardId) continue;

          /* =====================================================
             EVENT ROUTING
          ===================================================== */

          if (type === "vote:cast") {
            eventBus.emit("vote:cast", payload);

            // 🧠 ML v5 TRIGGER (IMPORTANT ADDITION)
            await handleMLPipeline(payload);
          }

          if (type === "fraud:check") {
            eventBus.emit("fraud:check", payload);
          }

          if (type === "ml:intelligence:update") {
            await handleMLPipeline(payload);
          }

          if (type === "analytics:event") {
            eventBus.emit("analytics:event", payload);
          }

          /* ACK */
          await redis.xAck(STREAM_KEY, GROUP, message.id);
        }
      }
    } catch (err) {
      console.error(`Shard ${shardId} error:`, err.message);
    }
  }
}

/* =========================================================
   BOOTSTRAP CLUSTER
========================================================= */
async function bootstrapERIEv3(shardCount = 4) {
  const workers = [];

  for (let i = 0; i < shardCount; i++) {
    startConsumer(i, shardCount);
    workers.push(i);
  }

  console.log(`🚀 ERIE v3 Cluster running (${shardCount} shards)`);

  return workers;
}

/* =========================================================
   EXPORTS
========================================================= */
module.exports = {
  bootstrapERIEv3,
  publishEvent,
};