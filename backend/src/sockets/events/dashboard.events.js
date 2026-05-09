const eventBus = require("../../events/eventBus");

/**
 * DASHBOARD EVENT LAYER (SaaS CORE)
 * ---------------------------------
 * Converts backend actions into real-time UI updates
 * Fully decoupled from socket implementation
 */

/* =========================================================
   DASHBOARD STATS UPDATE
========================================================= */

function broadcastDashboardStats(stats) {
  eventBus.emit("dashboard:update", {
    totalUsers: stats.totalUsers,
    totalElections: stats.totalElections,
    activeElections: stats.activeElections,
    totalVotes: stats.totalVotes,
    updatedAt: new Date(),
  });
}

/* =========================================================
   VOTE EVENTS → DASHBOARD IMPACT
========================================================= */

function onVoteCast(payload) {
  // Live activity feed event
  eventBus.emit("activity:new", {
    title: "New vote cast",
    type: "vote",
    time: new Date(),
  });

  // Dashboard stats update
  eventBus.emit("dashboard:update", {
    totalVotes: payload.totalVotes,
    electionId: payload.electionId,
  });
}

/* =========================================================
   ELECTION EVENTS
========================================================= */

function onElectionCreated(election) {
  eventBus.emit("activity:new", {
    title: `New election created: ${election.title}`,
    type: "election",
    time: new Date(),
  });

  eventBus.emit("dashboard:update", {
    totalElections: election.totalElections,
  });
}

function onElectionStatusChanged({ electionId, status }) {
  eventBus.emit("activity:new", {
    title: `Election ${status}`,
    type: "election-status",
    time: new Date(),
  });

  eventBus.emit("dashboard:update", {
    electionId,
    status,
    activeElectionsDelta:
      status === "active" ? 1 : status === "closed" ? -1 : 0,
  });
}

/* =========================================================
   USER EVENTS
========================================================= */

function onUserRegistered(stats) {
  eventBus.emit("activity:new", {
    title: "New user registered",
    type: "user",
    time: new Date(),
  });

  eventBus.emit("dashboard:update", {
    totalUsers: stats.totalUsers,
  });
}

/* =========================================================
   SYSTEM ALERTS (ADMIN ONLY)
========================================================= */

function sendSystemAlert(message, level = "info") {
  eventBus.emit("system:alert", {
    message,
    level, // info | warning | error
    time: new Date(),
  });
}

/* =========================================================
   OPTIONAL: CENTRAL REGISTRATION HOOK (for socket layer)
========================================================= */

function registerDashboardEvents(io) {
  eventBus.on("dashboard:update", (data) => {
    io.emit("dashboard:update", data);
  });

  eventBus.on("activity:new", (activity) => {
    io.emit("dashboard:update", { activity });
  });

  eventBus.on("system:alert", (alert) => {
    io.emit("system:alert", alert);
  });
}

/* ========================================================= */

module.exports = {
  broadcastDashboardStats,
  onVoteCast,
  onElectionCreated,
  onElectionStatusChanged,
  onUserRegistered,
  sendSystemAlert,
  registerDashboardEvents,
};