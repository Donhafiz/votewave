import { socket } from "./socket.js";

// Simulate live votes every 5 seconds
setInterval(() => {
  socket.emit("vote:cast", {
    electionId: "E-1001",
    candidateId: "C-202",
    totalVotes: Math.floor(Math.random() * 5000)
  });
}, 5000);

// Simulate election updates
setInterval(() => {
  socket.emit("election:update", {
    title: "Student President Election",
    status: "LIVE"
  });
}, 8000);