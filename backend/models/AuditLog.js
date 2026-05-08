const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  action: {
    type: String,
    required: true,
    enum: [
      'LOGIN',
      'LOGOUT',
      'REGISTER',
      'VOTE_CAST',
      'VOTE_VERIFY',
      'ELECTION_CREATE',
      'ELECTION_UPDATE',
      'ELECTION_DELETE',
      'CANDIDATE_ADD',
      'CANDIDATE_UPDATE',
      'CANDIDATE_REMOVE',
      'PROFILE_UPDATE',
      'PASSWORD_CHANGE',
      'PASSWORD_RESET',
      'OTP_VERIFY',
      'OTP_RESEND',
      'ROLE_CHANGE',
      'SETTINGS_UPDATE',
      'EXPORT_RESULTS',
      'AI_QUERY',
      'AI_REPORT_GENERATE',
      'SUSPICIOUS_ACTIVITY',
      'FAILED_LOGIN',
      'ACCESS_DENIED',
    ],
  },
  targetType: {
    type: String,
    enum: ['user', 'election', 'candidate', 'vote', 'system', null],
    default: null,
  },
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null,
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  ipAddress: {
    type: String,
    required: true,
  },
  userAgent: {
    type: String,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
  severity: {
    type: String,
    enum: ['info', 'warning', 'error', 'critical'],
    default: 'info',
  },
}, { timestamps: true });

auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ user: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
