import mongoose from 'mongoose';

const adminRuleConfigSchema = new mongoose.Schema({
  enabled: {
    type: Boolean,
    default: true
  },
  // Chat Rules
  chatDailyLimit: {
    type: Number,
    default: 1 // Max 1 count per day per user pair
  },
  chatRequireDifferentText: {
    type: Boolean,
    default: true
  },
  // Media Rules
  preventImageReuse: {
    type: Boolean,
    default: true
  },
  preventAudioReuse: {
    type: Boolean,
    default: true
  },
  preventEmojiReuse: {
    type: Boolean,
    default: true
  },
  // Special Rules
  fridayMultiplier: {
    enabled: {
      type: Boolean,
      default: true
    },
    multiplier: {
      type: Number,
      default: 2
    }
  },
  // Milestone Rewards
  milestoneRewards: {
    likesThreshold: {
      type: Number,
      default: 1000
    },
    likesReward: {
      type: Number,
      default: 1000
    },
    likesWindowDays: {
      type: Number,
      default: 30
    },
    commentsThreshold: {
      type: Number,
      default: 100
    },
    commentsReward: {
      type: Number,
      default: 1000
    },
    commentsWindowDays: {
      type: Number,
      default: 30
    },
    sharesThreshold: {
      type: Number,
      default: 100
    },
    sharesReward: {
      type: Number,
      default: 1000
    },
    sharesWindowDays: {
      type: Number,
      default: 30
    }
  },
  // Leaderboard Config
  leaderboardCountType: {
    type: String,
    enum: ['monthly', 'yearly', 'lifetime'],
    default: 'monthly'
  },
  // Popularity System
  topChatterThreshold: {
    monthly: {
      type: Number,
      default: 1000
    },
    total: {
      type: Number,
      default: 10000
    }
  },
  // Anti-Spam
  spamDetection: {
    enabled: {
      type: Boolean,
      default: true
    },
    duplicateMessageWindow: {
      type: Number,
      default: 24 // hours
    },
    maxDailyActions: {
      type: Number,
      default: 1000
    }
  },
  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  lastUpdatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Ensure only one config exists
adminRuleConfigSchema.statics.getConfig = async function() {
  let config = await this.findOne();
  if (!config) {
    // Create default config with all default values
    config = await this.create({
      enabled: true,
      chatDailyLimit: 1,
      chatRequireDifferentText: true,
      preventImageReuse: true,
      preventAudioReuse: true,
      preventEmojiReuse: true,
      fridayMultiplier: {
        enabled: true,
        multiplier: 2
      },
      milestoneRewards: {
        likesThreshold: 1000,
        likesReward: 1000,
        likesWindowDays: 30,
        commentsThreshold: 100,
        commentsReward: 1000,
        commentsWindowDays: 30,
        sharesThreshold: 100,
        sharesReward: 1000,
        sharesWindowDays: 30
      },
      leaderboardCountType: 'monthly',
      topChatterThreshold: {
        monthly: 1000,
        total: 10000
      },
      spamDetection: {
        enabled: true,
        duplicateMessageWindow: 24,
        maxDailyActions: 1000
      }
    });
  }
  return config;
};

const AdminRuleConfig = mongoose.model('AdminRuleConfig', adminRuleConfigSchema);

export default AdminRuleConfig;

