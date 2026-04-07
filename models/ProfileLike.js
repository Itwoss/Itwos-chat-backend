import mongoose from 'mongoose';

const profileLikeSchema = new mongoose.Schema(
  {
    profileUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    likedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    date: {
      type: String,
      required: true,
      index: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { versionKey: false }
);

profileLikeSchema.index(
  { profileUserId: 1, likedByUserId: 1, date: 1 },
  { unique: true }
);
profileLikeSchema.index({ profileUserId: 1, date: 1 });

export default mongoose.model('ProfileLike', profileLikeSchema);
