const SOCKET_URL = "http://localhost:3001";

export const socket = io(SOCKET_URL, {
  transports: ["websocket"],
  autoConnect: true
});

socket.on("connect", () => {
  console.log("🔌 Connected to VoteWave realtime system:", socket.id);
});

socket.on("disconnect", () => {
  console.log("❌ Disconnected from realtime system");
});