let io;

function initializeSocket(serverIO) {
  io = serverIO;

  io.on("connection", (socket) => {
    console.log("🟢 Admin connected:", socket.id);

    // SaaS-style grouping
    socket.join("admins");

    socket.on("disconnect", () => {
      console.log("🔴 Admin disconnected:", socket.id);
    });
  });
}

/* ================= CORE EMITTER ================= */
function emit(event, data) {
  if (!io) return;
  io.to("admins").emit(event, data);
}

/* ================= DASHBOARD ================= */
function emitDashboardUpdate(data) {
  emit("dashboard:update", data);
}

/* ================= VOTE ================= */
function emitVoteUpdate(data) {
  emit("vote:update", data);
}

/* ================= ELECTION STATUS ================= */
function emitElectionStatusChange(electionId, status) {
  emit("election:status", {
    electionId,
    status,
    timestamp: new Date(),
  });
}

/* ================= NEW ELECTION ================= */
function emitNewElection(election) {
  emit("election:new", {
    election,
    timestamp: new Date(),
  });
}

/* ================= LIVE ACTIVITY FEED ================= */
function emitActivity(activity) {
  emit("dashboard:activity", {
    ...activity,
    time: new Date(),
  });
}

module.exports = {
  initializeSocket,
  emitDashboardUpdate,
  emitVoteUpdate,
  emitElectionStatusChange,
  emitNewElection,
  emitActivity,
};