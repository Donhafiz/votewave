const eventBus = require("../events/eventBus");

const {
  projectVoteResult,
} = require("./vote.projection");

function startProjectionRunner() {
  console.log("📊 Projection Runner Started");

  eventBus.on("vote:cast", async (payload) => {
    await projectVoteResult(payload);
  });
}

module.exports = {
  startProjectionRunner,
};