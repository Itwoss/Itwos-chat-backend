import mongoose from 'mongoose';

const profileReportSchema = new mongoose.Schema(
  {
    reportedUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
      enum: [
        'Spam',
        'Harassment or bullying',
        'Fake account',
        'Scam or fraud',
        'Inappropriate content',
        'Something else',
      ],
    },
    status: {
      type: String,
      enum: ['pending', 'reviewed'],
      default: 'pending',
      index: true,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

profileReportSchema.index({ reportedUser: 1, reportedBy: 1, createdAt: -1 });

export default mongoose.model('ProfileReport', profileReportSchema);
