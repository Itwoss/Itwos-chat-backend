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
    required: true,
    trim: true
  },
  images: [{
    type: String, // Cloudinary URLs
  }],
  song: {
    type: String, // Cloudinary URL for audio file
    default: null
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
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
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

// Indexes for better query performance
postSchema.index({ author: 1, createdAt: -1 });
postSchema.index({ author: 1, isArchived: 1, createdAt: -1 });
postSchema.index({ createdAt: -1 });
postSchema.index({ isRemoved: 1, createdAt: -1 });

const Post = mongoose.model('Post', postSchema);

export default Post;

