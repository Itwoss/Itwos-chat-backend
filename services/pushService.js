import webpush from 'web-push';
import PushSubscriptionModel from '../models/PushSubscription.js';

const vapidPublicKey = (process.env.VAPID_PUBLIC_KEY || '').trim() || null;
const vapidPrivateKey = (process.env.VAPID_PRIVATE_KEY || '').trim() || null;

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(
    process.env.VAPID_MAILTO || 'mailto:support@example.com',
    vapidPublicKey,
    vapidPrivateKey
  );
} else {
  console.warn('[Push] VAPID keys missing. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in .env (generate with: npx web-push generate-vapid-keys). System notifications will not work.');
}

/**
 * Send push notification to a user (all their registered subscriptions).
 * Removes subscriptions that return 410 Gone or 404 Not Found (invalid/expired).
 * @param {string|ObjectId} userId - User ID to send to
 * @param {{ title: string, body?: string, url?: string, tag?: string }} payload
 * @returns {{ sent: number, failed: number }} - number of subscriptions that received the push vs failed
 */
export async function sendPushToUser(userId, { title, body = '', url = '/', tag = 'message' }) {
  const result = { sent: 0, failed: 0 };
  if (!vapidPublicKey || !vapidPrivateKey) {
    console.warn('[Push] VAPID keys not set; skip sending push');
    return result;
  }
  try {
    console.log('[Push] Querying subscriptions for userId:', userId.toString());
    const subs = await PushSubscriptionModel.find({ userId }).lean();
    console.log('[Push] Found subscriptions:', subs.length);
    if (subs.length === 0) {
      console.warn('[Push] No subscriptions for user', userId.toString(), '- receiver must enable notifications in the app (notification banner) on the device that should get the notification. MongoDB: db.pushsubscriptions.find({ userId: ObjectId("' + userId.toString() + '") })');
      return result;
    }
    console.log('[Push] Sending to', subs.length, 'subscription(s) for user', userId.toString());
    const safeTitle = typeof title === 'string' ? title.slice(0, 100) : 'New message';
    const safeBody = typeof body === 'string' ? body.slice(0, 200) : '';
    const safeUrl = typeof url === 'string' ? url.slice(0, 500) : '/';
    const safeTag = typeof tag === 'string' ? tag.slice(0, 100) : 'message';
    const payload = JSON.stringify({ title: safeTitle, body: safeBody, url: safeUrl, tag: safeTag });
    const results = await Promise.allSettled(
      subs.map((sub) => {
        const subscription = {
          endpoint: sub.endpoint,
          keys: sub.keys,
        };
        return webpush.sendNotification(subscription, payload);
      })
    );
    const toRemove = [];
    results.forEach((outcome, i) => {
      if (outcome.status === 'rejected') {
        result.failed += 1;
        const err = outcome.reason;
        const code = err?.statusCode ?? err?.status;
        if (code === 410 || code === 404) {
          toRemove.push(subs[i].endpoint);
        } else {
          console.warn('[Push] Send failed for', subs[i].endpoint?.slice(0, 50), err?.message || err);
        }
      } else {
        result.sent += 1;
      }
    });
    if (toRemove.length > 0) {
      await PushSubscriptionModel.deleteMany({ userId, endpoint: { $in: toRemove } });
      console.log('[Push] Removed', toRemove.length, 'expired/invalid subscription(s) for user', userId, '- user must re-enable notifications on that device.');
    }
  } catch (err) {
    console.error('[Push] Error sending to user:', userId, err.message);
  }
  return result;
}

export { vapidPublicKey };
