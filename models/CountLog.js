import mongoose from 'mongoose';

const countLogSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  actionType: {
    type: String,
    enum: ['chat', 'post_like', 'comment', 'share', 'event', 'friday_multiplier', 'milestone', 'admin_adjustment'],
    required: true,
    index: true
  },
  count: {
    type: Number,
    required: true
  },
  metadata: {
    // For chat actions
    chatId: mongoose.Schema.Types.ObjectId,
    messageId: mongoose.Schema.Types.ObjectId,
    recipientId: mongoose.Schema.Types.ObjectId,
    messageHash: String, // To detect duplicate messages
    
    // For post actions
    postId: mongoose.Schema.Types.ObjectId,
    
    // For event actions
    eventId: mongoose.Schema.Types.ObjectId,
    
    // For admin adjustments
    adjustedBy: mongoose.Schema.Types.ObjectId,
    reason: String,
    
    // General
    description: String
  },
  monthYear: {
    type: String, // Format: "Jan-2025"
    required: true,
    index: true
  },
  isValid: {
    type: Boolean,
    default: true,
    index: true
  },
  flaggedForReview: {
    type: Boolean,
    default: false,
    index: true
  },
  reviewNotes: {
    type: String
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
countLogSchema.index({ user: 1, monthYear: 1, actionType: 1 });
countLogSchema.index({ user: 1, createdAt: -1 });
countLogSchema.index({ monthYear: 1, isValid: 1 });
countLogSchema.index({ flaggedForReview: 1, createdAt: -1 });
countLogSchema.index({ 'metadata.messageHash': 1 }); // For duplicate detection
countLogSchema.index({ 'metadata.chatId': 1, 'metadata.recipientId': 1, createdAt: 1 }); // For daily chat limit

const CountLog = mongoose.model('CountLog', countLogSchema);

export default CountLog;

