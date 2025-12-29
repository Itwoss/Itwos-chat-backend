import mongoose from 'mongoose';

const leaderboardSnapshotSchema = new mongoose.Schema({
  snapshotType: {
    type: String,
    enum: ['weekly', 'monthly', 'yearly', 'lifetime'],
    required: true,
    index: true
  },
  period: {
    type: String, // Format: "2025-W01" for weekly, "Jan-2025" for monthly, "2025" for yearly, "lifetime" for lifetime
    required: true,
    index: true
  },
  region: {
    type: {
      type: String,
      enum: ['global', 'country', 'state', 'district'],
      default: 'global'
    },
    country: String,
    state: String,
    district: String
  },
  rankings: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    rank: {
      type: Number,
      required: true
    },
    count: {
      type: Number,
      required: true
    },
    previousRank: Number,
    rankChange: Number // positive = moved up, negative = moved down
  }],
  totalUsers: {
    type: Number,
    default: 0
  },
  generatedAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Compound indexes
leaderboardSnapshotSchema.index({ snapshotType: 1, period: 1, 'region.type': 1 }, { unique: true });
leaderboardSnapshotSchema.index({ generatedAt: -1 });

const LeaderboardSnapshot = mongoose.model('LeaderboardSnapshot', leaderboardSnapshotSchema);

export default LeaderboardSnapshot;

