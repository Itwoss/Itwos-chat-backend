import mongoose from 'mongoose';

/**
 * Web Push subscription per device. Multiple subscriptions per user are allowed (one per endpoint).
 * Unique on (userId, endpoint) so the same user can have push on phone, tablet, desktop, etc.
 */
const pushSubscriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    // compound index below covers userId
  },
  endpoint: { type: String, required: true },
  keys: {
    p256dh: { type: String, required: true },
    auth: { type: String, required: true },
  },
  userAgent: { type: String, default: '' },
}, { timestamps: true });

pushSubscriptionSchema.index({ userId: 1, endpoint: 1 }, { unique: true });

const PushSubscriptionModel = mongoose.model('PushSubscription', pushSubscriptionSchema);
export default PushSubscriptionModel;
