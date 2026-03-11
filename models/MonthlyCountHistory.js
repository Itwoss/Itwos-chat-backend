import mongoose from 'mongoose';

const monthlyCountHistorySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  monthYear: {
    type: String, // Format: "Jan-2025"
    required: true,
    index: true
  },
  count: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  rank: {
    type: Number
  },
  countryRank: {
    type: Number
  },
  stateRank: {
    type: Number
  },
  districtRank: {
    type: Number
  },
  breakdown: {
    chatCount: { type: Number, default: 0 },
    postLikesCount: { type: Number, default: 0 },
    commentsCount: { type: Number, default: 0 },
    sharesCount: { type: Number, default: 0 },
    eventBonus: { type: Number, default: 0 },
    fridayMultiplier: { type: Number, default: 0 },
    other: { type: Number, default: 0 }
  }
}, {
  timestamps: true
});

// Compound index for efficient queries
monthlyCountHistorySchema.index({ monthYear: 1, count: -1 });
monthlyCountHistorySchema.index({ user: 1, monthYear: 1 }, { unique: true });
monthlyCountHistorySchema.index({ monthYear: 1, rank: 1 });

const MonthlyCountHistory = mongoose.model('MonthlyCountHistory', monthlyCountHistorySchema);

export default MonthlyCountHistory;

