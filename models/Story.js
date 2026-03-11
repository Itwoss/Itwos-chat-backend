import mongoose from 'mongoose';

const storySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  mediaUrl: {
    type: String,
    required: [true, 'Media URL is required'],
    trim: true,
  },
  mediaType: {
    type: String,
    enum: ['image', 'video'],
    required: true,
    default: 'image',
  },
  caption: {
    type: String,
    trim: true,
    maxlength: [2200, 'Caption cannot exceed 2200 characters'],
    default: '',
  },
  privacy: {
    type: String,
    enum: ['public', 'followers', 'close_friends'],
    default: 'public',
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true,
  },
  viewCount: {
    type: Number,
    default: 0,
    min: 0,
  },
  views: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    viewedAt: { type: Date, default: Date.now },
  }],
  likeCount: {
    type: Number,
    default: 0,
    min: 0,
  },
  replyCount: {
    type: Number,
    default: 0,
    min: 0,
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true,
  },
  isRemoved: {
    type: Boolean,
    default: false,
    index: true,
  },
  removedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  removedAt: {
    type: Date
  },
  removalReason: {
    type: String,
    trim: true
  },
  musicUrl: {
    type: String,
    trim: true,
    default: null,
  },
  musicStartTime: {
    type: Number,
    default: 0,
    min: 0,
  },
  musicEndTime: {
    type: Number,
    default: null,
  },
  sound: {
    video_id: {
      type: String,
      trim: true,
    },
    title: {
      type: String,
      trim: true,
    },
    artist: {
      type: String,
      trim: true,
    },
    thumbnail: {
      type: String,
      trim: true,
    },
    preview_url: {
      type: String,
      trim: true,
    },
    source: {
      type: String,
      enum: ['youtube', 'spotify'],
      default: 'youtube',
    },
    startTime: {
      type: Number,
      default: 0,
      min: 0,
    },
    endTime: {
      type: Number,
      default: null,
      min: 0,
    },
  },
  videoVolume: {
    type: Number,
    default: 1,
    min: 0,
    max: 1,
  },
  musicVolume: {
    type: Number,
    default: 1,
    min: 0,
    max: 1,
  },
  location: {
    type: String,
    trim: true,
    default: null,
  },
  taggedUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  highlights: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Highlight',
  }],
}, {
  timestamps: true,
});

// Indexes for efficient querying
storySchema.index({ user: 1, createdAt: -1 });
storySchema.index({ expiresAt: 1, isActive: 1 });
storySchema.index({ privacy: 1, isActive: 1 });
storySchema.index({ createdAt: -1 });
storySchema.index({ isRemoved: 1, createdAt: -1 });

// Virtual for checking if story is expired
storySchema.virtual('isExpired').get(function() {
  return new Date() > this.expiresAt;
});

// Method to check if user can view story
storySchema.methods.canView = async function(viewerId) {
  if (!this.isActive || this.isExpired) {
    return false;
  }

  if (this.privacy === 'public') {
    return true;
  }

  if (this.privacy === 'followers') {
    const FriendRequest = mongoose.model('FriendRequest');
    const friendship = await FriendRequest.findOne({
      $or: [
        { fromUser: viewerId, toUser: this.user, status: 'accepted' },
        { fromUser: this.user, toUser: viewerId, status: 'accepted' }
      ]
    });
    return !!friendship;
  }

  if (this.privacy === 'close_friends') {
    // Implement close friends logic if needed
    return this.user.toString() === viewerId.toString();
  }

  return false;
};

const Story = mongoose.model('Story', storySchema);

export default Story;



