const twilio = require('twilio');
const sgMail = require('@sendgrid/mail');

router.post('/send', async (req, res) => {
  const { to, message, method } = req.body; // method: 'sms' or 'email'
  if (method === 'sms' && process.env.TWILIO_SID) {
    const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({ body: message, from: process.env.TWILIO_PHONE, to });
  } else if (method === 'email' && process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    await sgMail.send({ to, from: 'noreply@votewave.com', subject: 'Vote Confirmation', text: message });
  }
  res.json({ success: true });
});