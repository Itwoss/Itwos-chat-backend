import Subscription from '../models/Subscription.js';
import Payment from '../models/Payment.js';
import User from '../models/User.js';
import { createOrder as createRazorpayOrder, verifyPaymentSignature, getPaymentDetails } from '../utils/razorpay.js';

// Pricing configuration
const PRICING = {
  blue: {
    3: 1,
    6: 599,
    12: 999
  },
  yellow: {
    3: 1,
    6: 499,
    12: 899
  },
  pink: {
    3: 1,
    6: 399,
    12: 799
  }
};

// Get available subscription plans
export const getPlans = async (req, res) => {
  try {
    const plans = [
      {
        id: 'blue',
        name: 'Blue Verified Badge',
        icon: 'blue',
        description: 'Premium blue verified tick',
        durations: [
          { months: 3, price: PRICING.blue[3] },
          { months: 6, price: PRICING.blue[6] },
          { months: 12, price: PRICING.blue[12] }
        ]
      },
      {
        id: 'yellow',
        name: 'Yellow + Blue Verified Badge',
        icon: 'yellow',
        description: 'Yellow background with blue verified tick',
        durations: [
          { months: 3, price: PRICING.yellow[3] },
          { months: 6, price: PRICING.yellow[6] },
          { months: 12, price: PRICING.yellow[12] }
        ]
      },
      {
        id: 'pink',
        name: 'Pink + Blur Verified Badge',
        icon: 'pink',
        description: 'Pink verified tick with blur/glow effect',
        durations: [
          { months: 3, price: PRICING.pink[3] },
          { months: 6, price: PRICING.pink[6] },
          { months: 12, price: PRICING.pink[12] }
        ]
      }
    ];

    res.status(200).json({
      success: true,
      data: plans
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching plans',
      error: error.message
    });
  }
};

// Get user's current subscription
export const getMySubscription = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;

    const subscription = await Subscription.findOne({
      user: userId,
      status: { $in: ['active', 'cancelled'] }
    })
      .populate('payment')
      .sort({ createdAt: -1 });

    if (!subscription) {
      return res.status(200).json({
        success: true,
        data: null,
        message: 'No active subscription found'
      });
    }

    // Check if subscription has expired
    if (subscription.status === 'active' && subscription.expiryDate <= new Date()) {
      subscription.status = 'expired';
      await subscription.save();

      // Remove badge from user
      await User.findByIdAndUpdate(userId, {
        'subscription.badgeType': null,
        'subscription.subscriptionId': null
      });

      return res.status(200).json({
        success: true,
        data: null,
        message: 'Subscription has expired'
      });
    }

    res.status(200).json({
      success: true,
      data: subscription
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching subscription',
      error: error.message
    });
  }
};

// Create Razorpay order
export const createOrder = async (req, res) => {
  try {
    const { badgeType, duration } = req.body;
    const userId = req.user._id || req.user.id;

    // Validate inputs
    if (!badgeType || !['blue', 'yellow', 'pink'].includes(badgeType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid badge type'
      });
    }

    if (!duration || ![3, 6, 12].includes(duration)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid duration. Must be 3, 6, or 12 months'
      });
    }

    // Get price
    const amount = PRICING[badgeType][duration];
    if (!amount) {
      return res.status(400).json({
        success: false,
        message: 'Invalid badge type or duration combination'
      });
    }

    // Check if user already has an active subscription
    const existingSubscription = await Subscription.findOne({
      user: userId,
      status: 'active'
    });

    if (existingSubscription) {
      return res.status(400).json({
        success: false,
        message: 'You already have an active subscription. Please cancel it first or wait for it to expire.'
      });
    }

    // Generate receipt (max 40 characters for Razorpay)
    const receipt = `sub_${userId.toString().slice(-8)}_${Date.now().toString().slice(-10)}`.substring(0, 40);

    // Create Razorpay order
    const order = await createRazorpayOrder(amount, 'INR', receipt);

    res.status(200).json({
      success: true,
      data: {
        orderId: order.id,
        amount: amount,
        currency: 'INR',
        key: process.env.RAZORPAY_KEY_ID
      }
    });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating order',
      error: error.message
    });
  }
};

// Verify payment and create subscription
export const verifyPayment = async (req, res) => {
  try {
    const { orderId, paymentId, signature, badgeType, duration } = req.body;
    const userId = req.user._id || req.user.id;

    // Validate inputs
    if (!orderId || !paymentId || !signature || !badgeType || !duration) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    // Verify payment signature
    const isValidSignature = verifyPaymentSignature(orderId, paymentId, signature);
    if (!isValidSignature) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment signature'
      });
    }

    // Check if payment already processed
    const existingPayment = await Payment.findOne({ transactionId: paymentId });
    if (existingPayment) {
      return res.status(400).json({
        success: false,
        message: 'Payment already processed'
      });
    }

    // Get payment details from Razorpay
    const paymentDetails = await getPaymentDetails(paymentId);

    // Get price
    const amount = PRICING[badgeType][duration];

    // Create payment record
    const payment = await Payment.create({
      user: userId,
      amount,
      currency: 'INR',
      paymentMethod: 'razorpay',
      transactionId: paymentId,
      paymentStatus: 'completed',
      paymentDate: new Date(),
      badgeType,
      duration,
      paymentDetails: paymentDetails
    });

    // Calculate expiry date
    const startDate = new Date();
    const expiryDate = new Date();
    expiryDate.setMonth(expiryDate.getMonth() + duration);

    // Create subscription
    const subscription = await Subscription.create({
      user: userId,
      badgeType,
      duration,
      startDate,
      expiryDate,
      status: 'active',
      payment: payment._id
    });

    // Update user with subscription
    await User.findByIdAndUpdate(userId, {
      'subscription.badgeType': badgeType,
      'subscription.subscriptionId': subscription._id
    });

    // Populate subscription for response
    await subscription.populate('payment');

    res.status(200).json({
      success: true,
      message: 'Subscription purchased successfully',
      data: subscription
    });
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({
      success: false,
      message: 'Error verifying payment',
      error: error.message
    });
  }
};

// Cancel subscription
export const cancelSubscription = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;

    const subscription = await Subscription.findOne({
      user: userId,
      status: 'active'
    });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'No active subscription found'
      });
    }

    // Update subscription status to cancelled
    subscription.status = 'cancelled';
    subscription.cancelledAt = new Date();
    await subscription.save();

    // Immediately remove badge from user profile
    await User.findByIdAndUpdate(userId, {
      'subscription.badgeType': null,
      'subscription.subscriptionId': null
    });

    res.status(200).json({
      success: true,
      message: 'Subscription cancelled successfully. Your verified badge has been removed.',
      data: subscription
    });
  } catch (error) {
    console.error('Error cancelling subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Error cancelling subscription',
      error: error.message
    });
  }
};

