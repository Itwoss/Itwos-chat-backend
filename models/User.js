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
  }
}, {
  timestamps: true
});

// Index for faster queries
userSchema.index({ email: 1 });
userSchema.index({ role: 1 });

const User = mongoose.model('User', userSchema);

export default User;

