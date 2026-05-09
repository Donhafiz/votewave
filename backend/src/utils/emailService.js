const nodemailer = require('nodemailer');

const createTransporter = () => {
  return nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
};

const sendEmail = async (options) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: `VoteWave <${process.env.EMAIL_USER}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
    };

    const result = await transporter.sendMail(mailOptions);
    console.log(`Email sent successfully to ${options.to}: ${result.messageId}`);
    return result;
  } catch (error) {
    console.error('Email sending failed:', error.message);
    throw new Error(`Failed to send email: ${error.message}`);
  }
};

const sendOTPEmail = async (email, otp, firstName) => {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f9fafb; border-radius: 10px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #6366f1; margin: 0;">VoteWave</h1>
        <p style="color: #6b7280; margin: 5px 0;">Secure E-Voting Platform</p>
      </div>

      <div style="background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <h2 style="color: #1f2937; margin-top: 0;">Verify Your Email</h2>
        <p style="color: #4b5563; line-height: 1.6;">Hi ${firstName},</p>
        <p style="color: #4b5563; line-height: 1.6;">Thank you for joining VoteWave! To complete your registration, please use the verification code below:</p>

        <div style="text-align: center; margin: 30px 0;">
          <div style="background: #6366f1; color: white; font-size: 32px; font-weight: bold; padding: 20px 40px; border-radius: 8px; letter-spacing: 8px; display: inline-block; font-family: monospace;">
            ${otp}
          </div>
        </div>

        <p style="color: #6b7280; font-size: 14px; text-align: center; margin: 20px 0;">Your verification code: <strong style="font-size: 18px; color: #1f2937;">${otp}</strong></p>

        <p style="color: #6b7280; font-size: 14px;">This code will expire in 10 minutes.</p>
        <p style="color: #6b7280; font-size: 14px;">If you didn't create an account with VoteWave, please ignore this email.</p>
      </div>

      <div style="text-align: center; margin-top: 20px; color: #9ca3af; font-size: 12px;">
        <p>&copy; ${new Date().getFullYear()} VoteWave. All rights reserved.</p>
      </div>
    </div>
  `;

  await sendEmail({
    to: email,
    subject: 'Verify Your VoteWave Account - OTP: ' + otp,
    html,
  });
};

const sendVoteConfirmation = async (email, firstName, electionTitle, confirmationCode) => {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f9fafb; border-radius: 10px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #6366f1; margin: 0;">VoteWave</h1>
        <p style="color: #6b7280; margin: 5px 0;">Secure E-Voting Platform</p>
      </div>
      
      <div style="background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <h2 style="color: #1f2937; margin-top: 0;">Vote Confirmed!</h2>
        <p style="color: #4b5563; line-height: 1.6;">Hi ${firstName},</p>
        <p style="color: #4b5563; line-height: 1.6;">Your vote for <strong>${electionTitle}</strong> has been successfully recorded.</p>
        
        <div style="background: #ecfdf5; border: 1px solid #10b981; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="color: #065f46; margin: 0 0 10px 0; font-weight: bold;">Confirmation Code:</p>
          <p style="color: #065f46; font-size: 18px; font-weight: bold; margin: 0; letter-spacing: 2px;">${confirmationCode}</p>
        </div>
        
        <p style="color: #6b7280; font-size: 14px;">Please save this confirmation code for your records. You can use it to verify your vote was counted.</p>
        <p style="color: #6b7280; font-size: 14px;">Thank you for participating in our democratic process!</p>
      </div>
      
      <div style="text-align: center; margin-top: 20px; color: #9ca3af; font-size: 12px;">
        <p>&copy; ${new Date().getFullYear()} VoteWave. All rights reserved.</p>
      </div>
    </div>
  `;

  await sendEmail({
    to: email,
    subject: `Vote Confirmation - ${electionTitle}`,
    html,
  });
};

const sendPasswordReset = async (email, firstName, resetToken) => {
  const resetUrl = `${process.env.FRONTEND_URL}/auth/reset-password.html?token=${resetToken}`;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f9fafb; border-radius: 10px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #6366f1; margin: 0;">VoteWave</h1>
        <p style="color: #6b7280; margin: 5px 0;">Secure E-Voting Platform</p>
      </div>
      
      <div style="background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <h2 style="color: #1f2937; margin-top: 0;">Reset Your Password</h2>
        <p style="color: #4b5563; line-height: 1.6;">Hi ${firstName},</p>
        <p style="color: #4b5563; line-height: 1.6;">We received a request to reset your password. Click the button below to create a new password:</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background: #6366f1; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold;">Reset Password</a>
        </div>
        
        <p style="color: #6b7280; font-size: 14px;">This link will expire in 1 hour.</p>
        <p style="color: #6b7280; font-size: 14px;">If you didn't request a password reset, please ignore this email or contact support if you have concerns.</p>
      </div>
      
      <div style="text-align: center; margin-top: 20px; color: #9ca3af; font-size: 12px;">
        <p>&copy; ${new Date().getFullYear()} VoteWave. All rights reserved.</p>
      </div>
    </div>
  `;

  await sendEmail({
    to: email,
    subject: 'Password Reset Request - VoteWave',
    html,
  });
};

const sendElectionReminder = async (email, firstName, electionTitle, startDate) => {
  const formattedDate = new Date(startDate).toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f9fafb; border-radius: 10px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #6366f1; margin: 0;">VoteWave</h1>
        <p style="color: #6b7280; margin: 5px 0;">Secure E-Voting Platform</p>
      </div>
      
      <div style="background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <h2 style="color: #1f2937; margin-top: 0;">Election Starting Soon!</h2>
        <p style="color: #4b5563; line-height: 1.6;">Hi ${firstName},</p>
        <p style="color: #4b5563; line-height: 1.6;">The election <strong>${electionTitle}</strong> is starting soon!</p>
        
        <div style="background: #eff6ff; border: 1px solid #3b82f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="color: #1e40af; margin: 0; font-weight: bold;">Start Time: ${formattedDate}</p>
        </div>
        
        <p style="color: #4b5563; line-height: 1.6;">Don't forget to cast your vote and make your voice heard!</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL}/voter/elections.html" style="background: #6366f1; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold;">View Elections</a>
        </div>
      </div>
      
      <div style="text-align: center; margin-top: 20px; color: #9ca3af; font-size: 12px;">
        <p>&copy; ${new Date().getFullYear()} VoteWave. All rights reserved.</p>
      </div>
    </div>
  `;

  await sendEmail({
    to: email,
    subject: `Election Reminder: ${electionTitle}`,
    html,
  });
};

module.exports = {
  sendEmail,
  sendOTPEmail,
  sendVoteConfirmation,
  sendPasswordReset,
  sendElectionReminder,
};
