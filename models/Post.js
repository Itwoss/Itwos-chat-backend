import mongoose from 'mongoose';

const commentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: true,
    trim: true
  },
  mentions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { _id: true });

const postSchema = new mongoose.Schema({
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  content: {
    type: String,
    required: false, // Content is optional if images or song are present
    trim: true,
    default: ''
  },
  title: {
    type: String,
    required: false,
    trim: true,
    default: null
  },
  hashtags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  mentions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  // Optional links (up to 3): [{ name, url }, ...] shown below title
  links: [{
    name: { type: String, trim: true, default: '' },
    url: { type: String, trim: true, default: '' },
  }],
  images: [{
    type: String, // Cloudinary URLs
  }],
  song: {
    type: String, // Cloudinary URL for audio file
    default: null
  },
  video: {
    type: String, // Cloudinary URL for video file
    default: null
  },
  videoThumbnail: {
    type: String, // Cloudinary URL for video thumbnail image
    default: null
  },
  videoRatio: {
    type: String, // '1:1' | '4:5' | '16:9' | '9:16'
    trim: true,
    default: '4:5'
  },
  videoTrimStart: { type: Number, default: null },
  videoTrimEnd: { type: Number, default: null },
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
  isArchived: {
    type: Boolean,
    default: false,
    index: true
  },
  isRemoved: {
    type: Boolean,
    default: false,
    index: true
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
  // Per-image edit metadata from creator (ratio 9:16, 1:1, 4:5, etc.) so feed displays correct aspect ratio
  imageEditMetadata: [{
    type: mongoose.Schema.Types.Mixed,
    default: undefined
  }],
  borderRadius: {
    type: String,
    trim: true,
    default: null
  },
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  viewCount: {
    type: Number,
    default: 0,
    min: 0
  },
  comments: [commentSchema],
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Custom validator: Post must have at least content, images, song, or video
postSchema.pre('validate', function(next) {
  const hasContent = this.content && this.content.trim().length > 0;
  const hasImages = this.images && this.images.length > 0;
  const hasSong = this.song && this.song.trim().length > 0;
  const hasVideo = this.video && this.video.trim().length > 0;
  
  if (!hasContent && !hasImages && !hasSong && !hasVideo) {
    return next(new Error('Post must have at least content, images, a song, or a video'));
  }
  
  next();
});

// Indexes for better query performance
postSchema.index({ author: 1, createdAt: -1 });
postSchema.index({ author: 1, isArchived: 1, createdAt: -1 });
postSchema.index({ createdAt: -1 });
postSchema.index({ isRemoved: 1, createdAt: -1 });
postSchema.index({ hashtags: 1 });

const Post = mongoose.model('Post', postSchema);

export default Post;

