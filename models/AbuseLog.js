import mongoose from 'mongoose';

const abuseLogSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  abuseType: {
    type: String,
    enum: ['duplicate_message', 'media_reuse', 'emoji_spam', 'like_farming', 'comment_farming', 'share_farming', 'daily_limit_exceeded', 'suspicious_pattern', 'manual_flag'],
    required: true,
    index: true
  },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium',
    index: true
  },
  description: {
    type: String,
    required: true
  },
  evidence: {
    countLogIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CountLog'
    }],
    messageIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message'
    }],
    postIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post'
    }],
    screenshots: [String],
    metadata: mongoose.Schema.Types.Mixed
  },
  status: {
    type: String,
    enum: ['pending', 'reviewed', 'resolved', 'dismissed'],
    default: 'pending',
    index: true
  },
  actionTaken: {
    type: String,
    enum: ['none', 'warning', 'count_reduction', 'count_freeze', 'temporary_ban', 'permanent_ban'],
    default: 'none'
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewedAt: {
    type: Date
  },
  reviewNotes: {
    type: String
  },
  flaggedBy: {
    type: String,
    enum: ['system', 'admin'],
    default: 'system'
  },
  flaggedByUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes
abuseLogSchema.index({ user: 1, status: 1, createdAt: -1 });
abuseLogSchema.index({ status: 1, severity: 1, createdAt: -1 });
abuseLogSchema.index({ abuseType: 1, createdAt: -1 });

const AbuseLog = mongoose.model('AbuseLog', abuseLogSchema);

export default AbuseLog;

