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
  accountType: {
    type: String,
    enum: ['public', 'private'],
    default: 'public'
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
  }
}, {
  timestamps: true
});

// Index for faster queries
userSchema.index({ email: 1 });
userSchema.index({ role: 1 });
userSchema.index({ 'address.district': 1, 'address.state': 1, 'address.country': 1 });
userSchema.index({ 'address.pinCode': 1 });
// Additional indexes for scalability
userSchema.index({ accountType: 1, isActive: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ onlineStatus: 1, lastSeen: -1 });
userSchema.index({ 'subscription.badgeType': 1 });
userSchema.index({ role: 1, isActive: 1 }); // For admin queries

const User = mongoose.model('User', userSchema);

export default User;

