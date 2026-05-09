const { Server } = require("socket.io");
const { createAdapter } = require("@socket.io/redis-adapter");
const { createClient } = require("redis");

const eventBus = require("../events/eventBus");

/**
 * SOCKET MANAGER (PRODUCTION GRADE)
 * ----------------------------------
 * - Socket layer is ONLY a transport layer
 * - All logic comes from eventBus
 * - Redis enables horizontal scaling
 */

let io;

/* =========================================================
   INITIALIZE SOCKET SERVER
========================================================= */

async function initializeSocket(server) {
  io = new Server(server, {
    cors: {
      origin: "*", // tighten in production (frontend domain)
      methods: ["GET", "POST"],
    },
  });

  /* =========================
     REDIS ADAPTER (SCALING)
  ========================== */

  if (process.env.REDIS_URL) {
    try {
      const pubClient = createClient({ url: process.env.REDIS_URL });
      const subClient = pubClient.duplicate();

      await pubClient.connect();
      await subClient.connect();

      io.adapter(createAdapter(pubClient, subClient));

      console.log("✅ Redis Socket Adapter Connected");
    } catch (err) {
      console.error("⚠️ Redis adapter failed:", err.message);
    }
  }

  /* =========================
     CLIENT CONNECTION
  ========================== */

  io.on("connection", (socket) => {
    console.log("🟢 Client connected:", socket.id);

    socket.on("disconnect", () => {
      console.log("🔴 Client disconnected:", socket.id);
    });
  });

  /* =========================
     EVENT BUS BRIDGE
  ========================== */

  registerEventBusHandlers();

  return io;
}

/* =========================================================
   EVENT BUS → SOCKET BRIDGE
========================================================= */

function registerEventBusHandlers() {
  if (!io) return;

  /**
   * DASHBOARD UPDATES
   */
  eventBus.on("dashboard:update", (data) => {
    io.emit("dashboard:update", data);
  });

  /**
   * ACTIVITY FEED
   */
  eventBus.on("activity:new", (activity) => {
    io.emit("dashboard:update", { activity });
  });

  /**
   * SYSTEM ALERTS
   */
  eventBus.on("system:alert", (alert) => {
    io.emit("system:alert", alert);
  });

  /**
   * VOTE UPDATES
   */
  eventBus.on("vote:update", (data) => {
    io.emit("vote:update", data);
  });

  /**
   * ELECTION EVENTS
   */
  eventBus.on("election:update", (data) => {
    io.emit("election:update", data);
  });
}

/* =========================================================
   OPTIONAL: DIRECT EMIT HELPERS (SAFE USE ONLY)
========================================================= */

function emitToAll(event, data) {
  if (io) io.emit(event, data);
}

function emitToRoom(room, event, data) {
  if (io) io.to(room).emit(event, data);
}

/* ========================================================= */

module.exports = {
  initializeSocket,
  emitToAll,
  emitToRoom,
};