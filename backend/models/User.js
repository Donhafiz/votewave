const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true,
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true,
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 6,
    select: false,
  },
  avatar: {
    type: String,
    default: null,
  },
  role: {
    type: String,
    enum: ['voter', 'admin', 'superadmin'],
    default: 'voter',
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
  otpCode: {
    type: String,
    select: false,
  },
  otpExpires: {
    type: Date,
    select: false,
  },
  resetPasswordToken: {
    type: String,
    select: false,
  },
  resetPasswordExpires: {
    type: Date,
    select: false,
  },
  twoFactorEnabled: {
    type: Boolean,
    default: false,
  },
  twoFactorSecret: {
    type: String,
    select: false,
  },
  notificationPreferences: {
    emailNotifications: { type: Boolean, default: true },
    electionReminders: { type: Boolean, default: true },
    resultNotifications: { type: Boolean, default: true },
  },
  lastLogin: {
    type: Date,
  },
  votingHistory: [{
    election: { type: mongoose.Schema.Types.ObjectId, ref: 'Election' },
    votedAt: { type: Date, default: Date.now },
  }],
  isBanned: {
    type: Boolean,
    default: false,
  },
  banReason: {
    type: String,
    default: null,
  },
  bannedAt: {
    type: Date,
    default: null,
  },
  banExpiry: {
    type: Date,
    default: null,
  },
}, { timestamps: true });

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.getFullName = function() {
  return `${this.firstName} ${this.lastName}`;
};

module.exports = mongoose.model('User', userSchema);
