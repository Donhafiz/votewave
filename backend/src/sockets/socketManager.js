const { Server } = require("socket.io");
const { createAdapter } = require("@socket.io/redis-adapter");
const { createClient } = require("redis");

// FIXED PATH (your real structure)
const eventBus = require("../sockets/events/eventBus");

// AI FUSION ENGINE (for dashboard streaming)
const aiFusion = require("../ai/fusion.engine");

let io;
let dashboardStreamStarted = false;

/* =========================================================
   INITIALIZE SOCKET SERVER
========================================================= */
async function initializeSocket(server) {
  io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || "*",
      methods: ["GET", "POST"],
    },
  });

  /* =========================
     REDIS ADAPTER (SCALING LAYER)
  ========================== */
  if (process.env.REDIS_URL) {
    try {
      const pubClient = createClient({ url: process.env.REDIS_URL });
      const subClient = pubClient.duplicate();

      pubClient.on("error", (err) => console.error("Redis pub error:", err));
      subClient.on("error", (err) => console.error("Redis sub error:", err));

      await pubClient.connect();
      await subClient.connect();

      io.adapter(createAdapter(pubClient, subClient));

      console.log("✅ Redis Socket Adapter Connected");
    } catch (err) {
      console.error("⚠️ Redis adapter failed:", err.message);
    }
  }

  /* =========================
     CONNECTION HANDLING
  ========================== */
  io.on("connection", (socket) => {
    console.log("🟢 Client connected:", socket.id);

    socket.on("tenant:join", (tenantId) => {
      socket.join(`tenant:${tenantId}`);
    });

    socket.on("election:join", (electionId) => {
      socket.join(`election:${electionId}`);
    });

    socket.on("disconnect", () => {
      console.log("🔴 Client disconnected:", socket.id);
    });
  });

  registerEventBusHandlers();

  // 🚀 START AI DASHBOARD STREAM (SAFE SINGLE INSTANCE)
  startDashboardStream();

  return io;
}

/* =========================================================
   EVENT BUS → SOCKET BRIDGE
========================================================= */
function registerEventBusHandlers() {
  if (!io) return;

  eventBus.on("dashboard:update", (data) => {
    io.to(`tenant:${data.tenantId || "global"}`).emit(
      "dashboard:update",
      data
    );
  });

  eventBus.on("activity:new", (activity) => {
    io.to(`tenant:${activity.tenantId || "global"}`).emit(
      "activity:new",
      activity
    );
  });

  eventBus.on("system:alert", (alert) => {
    io.emit("system:alert", alert);
  });

  eventBus.on("vote:update", (data) => {
    io.to(`election:${data.electionId}`).emit("vote:update", data);
  });

  eventBus.on("election:update", (data) => {
    io.to(`tenant:${data.tenantId}`).emit("election:update", data);
  });
}

/* =========================================================
   🧠 AI DASHBOARD STREAM (CLUSTER-SAFE)
========================================================= */
function startDashboardStream() {
  if (dashboardStreamStarted) return; // prevent duplicates

  dashboardStreamStarted = true;

  setInterval(async () => {
    try {
      if (!io) return;

      const intelligence =
        await aiFusion.generateElectionIntelligence({
          tenantId: "global",
          electionId: "active",
        });

      io.emit("dashboard:live", intelligence);
    } catch (err) {
      console.error("Dashboard stream error:", err.message);
    }
  }, 3000);

  console.log("🚀 AI Dashboard Stream Started");
}

/* =========================================================
   SAFE EMITTERS
========================================================= */

function emitToAll(event, data) {
  if (io) io.emit(event, data);
}

function emitToTenant(tenantId, event, data) {
  if (io) io.to(`tenant:${tenantId}`).emit(event, data);
}

function emitToElection(electionId, event, data) {
  if (io) io.to(`election:${electionId}`).emit(event, data);
}

/* ========================================================= */

module.exports = {
  initializeSocket,
  emitToAll,
  emitToTenant,
  emitToElection,
};