import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters']
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  countryCode: {
    type: String,
    required: [true, 'Country code is required'],
    trim: true
  },
  phoneNumber: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true
  },
  fullNumber: {
    type: String,
    required: [true, 'Full number is required'],
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  profileImage: {
    type: String,
    trim: true
  },
  bio: {
    type: String,
    trim: true,
    maxlength: [500, 'Bio cannot exceed 500 characters'],
    default: ''
  },
  accountType: {
    type: String,
    enum: ['public', 'private'],
    default: 'public'
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other'],
    required: false
  },
  onlineStatus: {
    type: String,
    enum: ['online', 'offline', 'away'],
    default: 'offline'
  },
  lastSeen: {
    type: Date,
    default: Date.now
  },
  privacySettings: {
    hideLastSeen: {
      type: Boolean,
      default: false
    },
    hideOnlineStatus: {
      type: Boolean,
      default: false
    }
  },
  subscription: {
    badgeType: {
      type: String,
      enum: ['blue', 'yellow', 'pink'],
      default: null,
      required: false
    },
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subscription',
      default: null,
      required: false
    }
  },
  bannerInventory: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Banner',
    default: []
  }],
  equippedBanner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Banner',
    default: null
  },
  address: {
    street: {
      type: String,
      trim: true
    },
    district: {
      type: String,
      trim: true
    },
    state: {
      type: String,
      trim: true
    },
    country: {
      type: String,
      trim: true
    },
    pinCode: {
      type: String,
      trim: true
    }
  },
  navbarSettings: {
    navbarType: {
      type: String,
      enum: ['normal', 'advanced', 'slide'],
      default: 'normal'
    },
    advancedNavbar: {
      position: { type: String, default: 'bottom-left' },
      items: { type: Array, default: [] }
    },
    slideNavigation: {
      enabled: { type: Boolean, default: false },
      edgeOnly: { type: Boolean, default: false }
    }
  },
  warnings: [{
    type: {
      type: String,
      enum: ['post', 'story', 'general'],
      required: true
    },
    reason: {
      type: String,
      required: true,
      trim: true
    },
    contentId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'warnings.contentType'
    },
    contentType: {
      type: String,
      enum: ['Post', 'Story']
    },
    warnedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    warnedAt: {
      type: Date,
      default: Date.now
    }
  }],
  isBlocked: {
    type: Boolean,
    default: false
  },
  blockedAt: {
    type: Date
  },
  blockedReason: {
    type: String,
    trim: true
  },
  // Count System Fields
  currentMonthCount: {
    type: Number,
    default: 0,
    min: 0
  },
  monthlyHistory: [{
    monthYear: {
      type: String, // Format: "Jan-2025"
      required: true
    },
    count: {
      type: Number,
      required: true,
      min: 0
    },
    rank: {
      type: Number
    }
  }],
  totalCount: {
    type: Number,
    default: 0,
    min: 0
  },
  countFrozen: {
    type: Boolean,
    default: false
  },
  hiddenFromLeaderboard: {
    type: Boolean,
    default: false
  },
  lastCountReset: {
    type: Date
  },
  // Popularity System
  isTopChatter: {
    type: Boolean,
    default: false
  },
  popularityBadge: {
    type: String,
    enum: [null, 'bronze', 'silver', 'gold', 'platinum'],
    default: null
  },
  // Saved posts (bookmarks)
  savedPosts: [{
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true },
    savedAt: { type: Date, default: Date.now },
    folderTitle: { type: String, default: null, trim: true }
  }],
  // Saved songs (music) - sync across devices
  savedSongs: [{
    video_id: { type: String, required: true },
    title: { type: String, default: '' },
    artist: { type: String, default: '' },
    thumbnail: { type: String, default: null },
    preview_url: { type: String, default: null },
    source: { type: String, default: 'youtube' },
    startTime: { type: Number, default: 0 },
    endTime: { type: Number, default: null },
    savedAt: { type: Date, default: Date.now }
  }]
}, {
  timestamps: true
});

// Index for faster queries (email already indexed via unique: true)
userSchema.index({ role: 1 });
userSchema.index({ 'address.district': 1, 'address.state': 1, 'address.country': 1 });
userSchema.index({ 'address.pinCode': 1 });
// Additional indexes for scalability
userSchema.index({ accountType: 1, isActive: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ onlineStatus: 1, lastSeen: -1 });
userSchema.index({ 'subscription.badgeType': 1 });
userSchema.index({ role: 1, isActive: 1 }); // For admin queries
userSchema.index({ currentMonthCount: -1 }); // For monthly leaderboard
userSchema.index({ totalCount: -1 }); // For lifetime leaderboard
userSchema.index({ 'address.country': 1, currentMonthCount: -1 }); // For country leaderboard
userSchema.index({ 'address.state': 1, currentMonthCount: -1 }); // For state leaderboard
userSchema.index({ 'address.district': 1, currentMonthCount: -1 }); // For district leaderboard
userSchema.index({ isTopChatter: 1, hiddenFromLeaderboard: 1 }); // For popularity suggestions

const User = mongoose.model('User', userSchema);

export default User;

