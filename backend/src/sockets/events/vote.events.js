const eventBus = require("../../events/eventBus");

function registerVoteEvents(io) {

  eventBus.on("vote:cast", (payload) => {
    io.emit("vote:update", payload);
  });

  eventBus.on("vote:dashboardUpdate", (payload) => {
    io.emit("dashboard:update", payload);
  });

}

module.exports = registerVoteEvents;