import mongoose from 'mongoose';

const bannerPaymentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  banner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Banner',
    required: true,
    index: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'INR'
  },
  orderId: {
    type: String,
    required: true,
    trim: true
  },
  razorpayPaymentId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  paymentStatus: {
    type: String,
    enum: ['verified', 'completed', 'failed', 'refunded'],
    default: 'verified',
    index: true
  },
  paymentDate: {
    type: Date,
    default: Date.now
  },
  paymentDetails: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

bannerPaymentSchema.index({ user: 1, paymentDate: -1 });
bannerPaymentSchema.index({ paymentDate: -1 });
bannerPaymentSchema.index({ user: 1, banner: 1, paymentStatus: 1 });

const BannerPayment = mongoose.model('BannerPayment', bannerPaymentSchema);

export default BannerPayment;
