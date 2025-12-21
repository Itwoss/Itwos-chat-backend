import cron from 'node-cron';
import Subscription from '../models/Subscription.js';
import User from '../models/User.js';

// Check and expire subscriptions
export const checkExpiredSubscriptions = async () => {
  try {
    const now = new Date();
    
    // Find all active subscriptions that have expired
    const expiredSubscriptions = await Subscription.find({
      status: 'active',
      expiryDate: { $lte: now }
    }).populate('user');

    if (expiredSubscriptions.length > 0) {
      // Update subscription status to expired
      await Subscription.updateMany(
        {
          status: 'active',
          expiryDate: { $lte: now }
        },
        {
          $set: {
            status: 'expired'
          }
        }
      );

      // Remove badges from user profiles
      const userIds = expiredSubscriptions.map(sub => sub.user._id);
      await User.updateMany(
        { _id: { $in: userIds } },
        {
          $set: {
            'subscription.badgeType': null,
            'subscription.subscriptionId': null
          }
        }
      );

      console.log(`Expired ${expiredSubscriptions.length} subscriptions at ${now.toISOString()}`);
    }
  } catch (error) {
    console.error('Error in subscription expiry check:', error);
  }
};

// Start cron job
export const startSubscriptionCron = () => {
  // Run every hour to check for expired subscriptions
  cron.schedule('0 * * * *', checkExpiredSubscriptions);

  // Also run immediately on startup
  checkExpiredSubscriptions();

  console.log('Subscription expiry cron job started (runs every hour)');
};



