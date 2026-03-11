import mongoose from 'mongoose';

const subscriptionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required'],
    index: true
  },
  badgeType: {
    type: String,
    enum: ['blue', 'yellow', 'pink'],
    required: [true, 'Badge type is required']
  },
  duration: {
    type: Number,
    enum: [3, 6, 12],
    required: [true, 'Duration is required']
  },
  startDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  expiryDate: {
    type: Date,
    required: [true, 'Expiry date is required'],
    index: true
  },
  status: {
    type: String,
    enum: ['active', 'expired', 'cancelled'],
    default: 'active',
    index: true
  },
  cancelledAt: {
    type: Date,
    default: null
  },
  payment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payment',
    required: [true, 'Payment is required']
  }
}, {
  timestamps: true
});

// Indexes for faster queries
subscriptionSchema.index({ user: 1, status: 1 });
subscriptionSchema.index({ expiryDate: 1, status: 1 });

const Subscription = mongoose.model('Subscription', subscriptionSchema);

export default Subscription;


