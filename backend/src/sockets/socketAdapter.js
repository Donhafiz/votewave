const { createAdapter } = require("@socket.io/redis-adapter");
const { createClient } = require("redis");

async function setupRedis(io) {
  const pubClient = createClient({ url: process.env.REDIS_URL });
  const subClient = pubClient.duplicate();

  await pubClient.connect();
  await subClient.connect();

  io.adapter(createAdapter(pubClient, subClient));

  console.log("Redis Socket Adapter Connected");
}

module.exports = setupRedis;