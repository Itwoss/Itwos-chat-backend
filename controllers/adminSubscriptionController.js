import Subscription from '../models/Subscription.js';
import Payment from '../models/Payment.js';
import User from '../models/User.js';

// Get all subscriptions (admin)
export const getAllSubscriptions = async (req, res) => {
  try {
    const { page = 1, limit = 10, status = '', badgeType = '', search = '' } = req.query;

    const query = {};

    if (status) {
      query.status = status;
    }

    if (badgeType) {
      query.badgeType = badgeType;
    }

    if (search) {
      // Search by user email or name
      const users = await User.find({
        $or: [
          { email: { $regex: search, $options: 'i' } },
          { name: { $regex: search, $options: 'i' } }
        ]
      }).select('_id');

      query.user = { $in: users.map(u => u._id) };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const subscriptions = await Subscription.find(query)
      .populate('user', 'name email profileImage')
      .populate('payment')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Subscription.countDocuments(query);

    res.status(200).json({
      success: true,
      data: subscriptions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching subscriptions',
      error: error.message
    });
  }
};

// Get subscription by ID (admin)
export const getSubscriptionById = async (req, res) => {
  try {
    const { id } = req.params;

    const subscription = await Subscription.findById(id)
      .populate('user', 'name email profileImage')
      .populate('payment');

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'Subscription not found'
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

// Update subscription (admin) - extend or modify
export const updateSubscription = async (req, res) => {
  try {
    const { id } = req.params;
    const { expiryDate, status } = req.body;

    const subscription = await Subscription.findById(id);

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'Subscription not found'
      });
    }

    if (expiryDate) {
      subscription.expiryDate = new Date(expiryDate);
    }

    if (status && ['active', 'expired', 'cancelled'].includes(status)) {
      subscription.status = status;

      // If status changed to expired or cancelled, remove badge
      if (status === 'expired' || status === 'cancelled') {
        await User.findByIdAndUpdate(subscription.user, {
          'subscription.badgeType': null,
          'subscription.subscriptionId': null
        });
      } else if (status === 'active') {
        // If reactivated, restore badge
        await User.findByIdAndUpdate(subscription.user, {
          'subscription.badgeType': subscription.badgeType,
          'subscription.subscriptionId': subscription._id
        });
      }
    }

    await subscription.save();

    res.status(200).json({
      success: true,
      message: 'Subscription updated successfully',
      data: subscription
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating subscription',
      error: error.message
    });
  }
};

// Revoke subscription (admin) - immediately remove badge
export const revokeSubscription = async (req, res) => {
  try {
    const { id } = req.params;

    const subscription = await Subscription.findById(id);

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'Subscription not found'
      });
    }

    subscription.status = 'cancelled';
    subscription.cancelledAt = new Date();
    await subscription.save();

    // Remove badge from user
    await User.findByIdAndUpdate(subscription.user, {
      'subscription.badgeType': null,
      'subscription.subscriptionId': null
    });

    res.status(200).json({
      success: true,
      message: 'Subscription revoked successfully',
      data: subscription
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error revoking subscription',
      error: error.message
    });
  }
};

// Extend subscription (admin)
export const extendSubscription = async (req, res) => {
  try {
    const { id } = req.params;
    const { additionalMonths } = req.body;

    if (!additionalMonths || additionalMonths <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid additional months'
      });
    }

    const subscription = await Subscription.findById(id);

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'Subscription not found'
      });
    }

    // Extend expiry date
    const currentExpiry = new Date(subscription.expiryDate);
    currentExpiry.setMonth(currentExpiry.getMonth() + additionalMonths);
    subscription.expiryDate = currentExpiry;

    // Reactivate if expired
    if (subscription.status === 'expired') {
      subscription.status = 'active';
      await User.findByIdAndUpdate(subscription.user, {
        'subscription.badgeType': subscription.badgeType,
        'subscription.subscriptionId': subscription._id
      });
    }

    await subscription.save();

    res.status(200).json({
      success: true,
      message: 'Subscription extended successfully',
      data: subscription
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error extending subscription',
      error: error.message
    });
  }
};

// Get subscription statistics (admin)
export const getSubscriptionStats = async (req, res) => {
  try {
    const totalSubscriptions = await Subscription.countDocuments();
    const activeSubscriptions = await Subscription.countDocuments({ status: 'active' });
    const expiredSubscriptions = await Subscription.countDocuments({ status: 'expired' });
    const cancelledSubscriptions = await Subscription.countDocuments({ status: 'cancelled' });

    const badgeTypeStats = await Subscription.aggregate([
      {
        $group: {
          _id: '$badgeType',
          count: { $sum: 1 }
        }
      }
    ]);

    const totalRevenue = await Payment.aggregate([
      {
        $match: { paymentStatus: 'completed' }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        total: totalSubscriptions,
        active: activeSubscriptions,
        expired: expiredSubscriptions,
        cancelled: cancelledSubscriptions,
        badgeTypeBreakdown: badgeTypeStats,
        totalRevenue: totalRevenue[0]?.total || 0
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching subscription stats',
      error: error.message
    });
  }
};

// Export subscriptions to CSV (admin)
export const exportSubscriptions = async (req, res) => {
  try {
    const subscriptions = await Subscription.find()
      .populate('user', 'name email')
      .populate('payment')
      .sort({ createdAt: -1 });

    // Convert to CSV format
    const csvHeader = 'User Name,User Email,Badge Type,Duration (months),Start Date,Expiry Date,Status,Amount Paid,Payment Method,Transaction ID,Payment Date\n';
    
    const csvRows = subscriptions.map(sub => {
      const user = sub.user || {};
      const payment = sub.payment || {};
      
      return [
        `"${user.name || ''}"`,
        `"${user.email || ''}"`,
        sub.badgeType,
        sub.duration,
        sub.startDate.toISOString().split('T')[0],
        sub.expiryDate.toISOString().split('T')[0],
        sub.status,
        payment.amount || 0,
        payment.paymentMethod || '',
        payment.transactionId || '',
        payment.paymentDate ? payment.paymentDate.toISOString().split('T')[0] : ''
      ].join(',');
    }).join('\n');

    const csv = csvHeader + csvRows;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=subscriptions.csv');
    res.status(200).send(csv);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error exporting subscriptions',
      error: error.message
    });
  }
};



