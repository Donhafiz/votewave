const { Worker } = require("bullmq");
const connection = require("../queues/connection");
const eventBus = require("../events/eventBus");

new Worker(
  "email-queue",
  async (job) => {
    const { email, subject, message } = job.data;

    console.log(`Sending email to ${email}`);

    // integrate nodemailer / sendgrid here
  },
  { connection }
);

console.log("🟢 Email Worker running");