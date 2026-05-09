const mongoose = require('mongoose');

const electionSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Election title is required'],
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  type: {
    type: String,
    enum: ['school', 'club', 'organization', 'event', 'other'],
    default: 'other',
  },
  status: {
    type: String,
    enum: ['draft', 'upcoming', 'active', 'closed', 'archived'],
    default: 'draft',
  },
  broadcasted: {
    type: Boolean,
    default: false, // Whether the election is live and visible on home page
  },
  broadcastedAt: {
    type: Date,
  },
  startDate: {
    type: Date,
    required: [true, 'Start date is required'],
  },
  endDate: {
    type: Date,
    required: [true, 'End date is required'],
  },
  timezone: {
    type: String,
    default: 'UTC',
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  candidates: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Candidate',
  }],
  categories: [{
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    nominees: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Candidate',
    }],
    maxVotes: {
      type: Number,
      default: 1, // How many votes per category
    },
    required: {
      type: Boolean,
      default: true,
    },
  }],
  eligibilityRules: {
    minAge: { type: Number, default: null },
    maxAge: { type: Number, default: null },
    requiredFields: [{ type: String }],
    allowedRoles: [{ type: String }],
    customCriteria: { type: String },
  },
  settings: {
    allowMultipleVotes: { type: Boolean, default: false },
    showResultsLive: { type: Boolean, default: false },
    showResultsAfterClose: { type: Boolean, default: true },
    requireVerification: { type: Boolean, default: true },
    publicAccess: { type: Boolean, default: false },
    anonymousVoting: { type: Boolean, default: true },
  },
  totalVotes: {
    type: Number,
    default: 0,
  },
  uniqueVoters: {
    type: Number,
    default: 0,
  },
  bannerImage: {
    type: String,
    default: null,
  },
  tags: [{
    type: String,
    trim: true,
  }],
  aiSummary: {
    type: String,
    default: null,
  },
  aiGeneratedAt: {
    type: Date,
    default: null,
  },
  activatedAt: {
    type: Date,
    default: null,
  },
  closedAt: {
    type: Date,
    default: null,
  },
  assignedAdmins: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    permissions: [{
      type: String,
      enum: ['view', 'monitor', 'manage_votes', 'edit_settings', 'view_results'],
    }],
    assignedAt: {
      type: Date,
      default: Date.now,
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  }],
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending',
  },
  paystackReference: {
    type: String,
    default: null,
  },
  paystackTransactionId: {
    type: String,
    default: null,
  },
  amountPaid: {
    type: Number,
    default: 0,
  },
}, { timestamps: true });

electionSchema.virtual('isActive').get(function() {
  const now = new Date();
  return this.status === 'active' && 
         now >= this.startDate && 
         now <= this.endDate;
});

electionSchema.virtual('timeRemaining').get(function() {
  if (this.status !== 'active') return null;
  const now = new Date();
  const end = new Date(this.endDate);
  const diff = end - now;
  if (diff <= 0) return null;
  
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return { hours, minutes };
});

electionSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Election', electionSchema);
