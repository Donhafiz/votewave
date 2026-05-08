const mongoose = require('mongoose');

const candidateSchema = new mongoose.Schema({
  election: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Election',
    required: true,
  },
  name: {
    type: String,
    required: [true, 'Candidate name is required'],
    trim: true,
  },
  photo: {
    type: String,
    default: null,
  },
  bio: {
    type: String,
    trim: true,
  },
  position: {
    type: String,
    trim: true,
  },
  platform: {
    type: String,
    trim: true,
  },
  qualifications: [{
    type: String,
    trim: true,
  }],
  socialLinks: {
    website: { type: String, trim: true },
    twitter: { type: String, trim: true },
    linkedin: { type: String, trim: true },
    instagram: { type: String, trim: true },
  },
  voteCount: {
    type: Number,
    default: 0,
  },
  votePercentage: {
    type: Number,
    default: 0,
  },
  displayOrder: {
    type: Number,
    default: 0,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, { timestamps: true });

candidateSchema.methods.updateVotePercentage = async function(totalVotes) {
  if (totalVotes === 0) {
    this.votePercentage = 0;
  } else {
    this.votePercentage = ((this.voteCount / totalVotes) * 100).toFixed(2);
  }
  await this.save();
};

module.exports = mongoose.model('Candidate', candidateSchema);
