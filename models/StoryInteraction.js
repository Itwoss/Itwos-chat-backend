import mongoose from 'mongoose';

const storyInteractionSchema = new mongoose.Schema({
  story: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Story',
    required: true,
    index: true,
  },
  viewer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  type: {
    type: String,
    enum: ['view', 'like', 'reply', 'emoji'],
    required: true,
    index: true,
  },
  emoji: {
    type: String,
    trim: true,
    default: null,
  },
  replyMessage: {
    type: String,
    trim: true,
    maxlength: [500, 'Reply message cannot exceed 500 characters'],
    default: null,
  },
  viewedAt: {
    type: Date,
    default: Date.now,
  },
  duration: {
    type: Number,
    default: 0,
    min: 0,
    comment: 'Time spent viewing the story in seconds',
  },
}, {
  timestamps: true,
});

// Compound index to prevent duplicate views
storyInteractionSchema.index({ story: 1, viewer: 1, type: 1 }, { unique: true });

// Index for efficient queries
storyInteractionSchema.index({ story: 1, type: 1, createdAt: -1 });
storyInteractionSchema.index({ viewer: 1, createdAt: -1 });

// Method to check if interaction exists
storyInteractionSchema.statics.hasInteracted = async function(storyId, viewerId, type) {
  const interaction = await this.findOne({
    story: storyId,
    viewer: viewerId,
    type: type,
  });
  return !!interaction;
};

const StoryInteraction = mongoose.model('StoryInteraction', storyInteractionSchema);

export default StoryInteraction;



