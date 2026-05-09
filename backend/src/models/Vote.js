const mongoose = require('mongoose');
const crypto = require('crypto');

const voteSchema = new mongoose.Schema({
  election: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Election',
    required: true,
  },
  voter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Election.categories',
    required: true,
  },
  candidate: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Candidate',
    required: true,
  },
  hashedSelection: {
    type: String,
    required: true,
  },
  ipAddress: {
    type: String,
    required: true,
  },
  userAgent: {
    type: String,
  },
  votedAt: {
    type: Date,
    default: Date.now,
  },
  confirmationCode: {
    type: String,
    unique: true,
  },
  isAnonymous: {
    type: Boolean,
    default: true,
  },
  payment: {
    amount: {
      type: Number,
      required: true,
      default: 1.00, // 1.00GHC per vote
    },
    currency: {
      type: String,
      default: 'GHC',
    },
    paystackReference: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'refunded'],
      default: 'pending',
    },
    paidAt: {
      type: Date,
    },
  },
}, { timestamps: true });

voteSchema.index({ election: 1, voter: 1, category: 1 }, { unique: true });

voteSchema.pre('save', function(next) {
  if (!this.confirmationCode) {
    this.confirmationCode = crypto.randomBytes(16).toString('hex').toUpperCase();
  }
  if (!this.hashedSelection) {
    const data = `${this.election}:${this.voter}:${this.candidate}:${Date.now()}`;
    this.hashedSelection = crypto.createHash('sha256').update(data).digest('hex');
  }
  next();
});

module.exports = mongoose.model('Vote', voteSchema);
