import PushSubscriptionModel from '../models/PushSubscription.js';
import { vapidPublicKey, sendPushToUser } from '../services/pushService.js';

export const getVapidPublicKey = (req, res) => {
  if (!vapidPublicKey) {
    return res.status(503).json({
      success: false,
      message: 'Push notifications are not configured',
    });
  }
  res.status(200).json({
    success: true,
    data: { publicKey: vapidPublicKey },
  });
};

/** Upsert by endpoint so multiple devices per user are supported (new device = new subscription). */
export const savePushSubscription = async (req, res) => {
  try {
    const userId = req.user._id;
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({
        success: false,
        message: 'endpoint and keys (p256dh, auth) are required',
      });
    }
    const userAgent = req.get('user-agent') || '';
    await PushSubscriptionModel.findOneAndUpdate(
      { endpoint },
      { userId, endpoint, keys, userAgent },
      { upsert: true, new: true }
    );
    res.status(200).json({
      success: true,
      message: 'Push subscription saved',
    });
  } catch (err) {
    console.error('[PushSubscription] save error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to save push subscription',
      error: err.message,
    });
  }
};

export const removePushSubscription = async (req, res) => {
  try {
    const userId = req.user._id;
    const { endpoint } = req.body;
    if (!endpoint) {
      return res.status(400).json({
        success: false,
        message: 'endpoint is required',
      });
    }
    await PushSubscriptionModel.deleteOne({ userId, endpoint });
    res.status(200).json({
      success: true,
      message: 'Push subscription removed',
    });
  } catch (err) {
    console.error('[PushSubscription] remove error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to remove push subscription',
      error: err.message,
    });
  }
};

/** Send a test push to the current user (for verifying notifications work). */
export const sendTestPush = async (req, res) => {
  try {
    const userId = req.user._id;
    const count = await PushSubscriptionModel.countDocuments({ userId });
    if (count === 0) {
      return res.status(400).json({
        success: false,
        message: 'No push subscription found. Enable notifications first (click Enable in the notification banner, or allow in browser settings), then try again.',
      });
    }
    const { sent, failed: _failed } = await sendPushToUser(userId, {
      title: 'Test notification',
      body: 'If you see this, push notifications are working.',
      url: '/user/home',
      tag: 'test-push',
    });
    if (sent === 0) {
      return res.status(503).json({
        success: false,
        message: 'Could not deliver to this device. Your subscription may be expired. Try enabling notifications again (banner or browser settings), then send test again.',
      });
    }
    res.status(200).json({
      success: true,
      message: 'Test notification sent. Check your device (or browser) for the notification.',
    });
  } catch (err) {
    console.error('[PushSubscription] sendTestPush error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to send test notification',
      error: err.message,
    });
  }
};
