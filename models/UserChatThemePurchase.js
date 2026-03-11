import mongoose from 'mongoose';

const userChatThemePurchaseSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  themeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChatTheme',
    required: true,
  },
  purchasedAt: {
    type: Date,
    default: Date.now,
  },
  paymentTransactionId: {
    type: String,
    default: null,
    sparse: true,
  },
}, { timestamps: true });

userChatThemePurchaseSchema.index({ userId: 1, themeId: 1 }, { unique: true });
userChatThemePurchaseSchema.index({ userId: 1 });

const UserChatThemePurchase = mongoose.model('UserChatThemePurchase', userChatThemePurchaseSchema);
export default UserChatThemePurchase;
