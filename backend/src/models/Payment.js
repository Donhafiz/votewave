const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
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
  vote: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vote',
  },
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
    unique: true,
  },
  paystackTransactionId: {
    type: String,
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'cancelled', 'refunded'],
    default: 'pending',
  },
  paymentMethod: {
    type: String,
    enum: ['card', 'mobile_money', 'bank_transfer'],
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
  },
  initiatedAt: {
    type: Date,
    default: Date.now,
  },
  completedAt: {
    type: Date,
  },
  failedAt: {
    type: Date,
  },
  failureReason: {
    type: String,
  },
}, { timestamps: true });

paymentSchema.index({ paystackReference: 1 }, { unique: true });
paymentSchema.index({ election: 1, voter: 1 });

module.exports = mongoose.model('Payment', paymentSchema);