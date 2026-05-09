const { Queue } = require("bullmq");
const connection = require("./connection");

const emailQueue = new Queue("email-queue", { connection });

async function sendEmailJob(data) {
  await emailQueue.add("send-email", data, {
    attempts: 5,
    backoff: { type: "exponential", delay: 3000 },
    removeOnComplete: true,
  });
}

module.exports = { emailQueue, sendEmailJob };