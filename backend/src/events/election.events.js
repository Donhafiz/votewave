const { emit } = require("../socketManager");

function emitElectionStatusChange(data) {
  emit("election:status", data);
}

function emitNewElection(data) {
  emit("election:new", data);
}

module.exports = {
  emitElectionStatusChange,
  emitNewElection,
};