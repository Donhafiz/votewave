import { socket } from "./socket";

export function initRealtimeListeners() {
  socket.on("vote:cast", (data) => {
    console.log("LIVE VOTE:", data);
    window.dispatchEvent(new CustomEvent("voteUpdate", { detail: data }));
  });

  socket.on("results:update", (data) => {
    window.dispatchEvent(new CustomEvent("resultsUpdate", { detail: data }));
  });

  socket.on("election:update", (data) => {
    window.dispatchEvent(new CustomEvent("electionUpdate", { detail: data }));
  });
}