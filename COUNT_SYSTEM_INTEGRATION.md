# Count System Integration Guide

## Overview
This document explains how to integrate the count system into existing features (chat, posts, likes, comments, shares).

## Quick Integration

### 1. Import the count service
```javascript
import { addCount, hashMessage } from '../services/countService.js';
```

### 2. Add count when sending chat message
In `backend/controllers/chatController.js`, in the `sendMessage` function, after creating the message:

```javascript
// After message is created (around line 417)
if (content && content.trim() && messageType === 'text') {
  const messageHash = hashMessage(content);
  await addCount(senderId, 'chat', 1, {
    chatId: chatId,
    messageId: message._id,
    recipientId: receiverId,
    messageHash: messageHash,
    messageText: content
  });
}
```

### 3. Add count for post likes
In your post like controller, after a like is added:

```javascript
await addCount(userId, 'post_like', 1, {
  postId: post._id
});
```

### 4. Add count for comments
In your comment controller, after a comment is created:

```javascript
await addCount(userId, 'comment', 1, {
  postId: post._id,
  commentId: comment._id
});
```

### 5. Add count for shares
In your share controller, after a share is created:

```javascript
await addCount(userId, 'share', 1, {
  postId: post._id
});
```

## API Endpoints Created

### User Endpoints
- `GET /api/count/me` - Get user's count summary
- `GET /api/count/me/logs` - Get user's count logs
- `GET /api/leaderboard` - Get leaderboard with filters
- `GET /api/leaderboard/me/history` - Get user's rank history
- `GET /api/events/active` - Get active events
- `POST /api/events/complete` - Complete an event

### Admin Endpoints
- `GET /api/admin/rules` - Get rule configuration
- `PUT /api/admin/rules` - Update rule configuration
- `POST /api/admin/rules/toggle` - Toggle count system on/off
- `POST /api/count/admin/adjust` - Manually adjust user count
- `POST /api/count/admin/reset-monthly/:userId` - Reset user's monthly count
- `POST /api/count/admin/toggle-freeze/:userId` - Freeze/unfreeze user count
- `GET /api/events/admin` - Get all events (admin)
- `POST /api/events/admin` - Create event
- `PUT /api/events/admin/:eventId` - Update event
- `POST /api/events/admin/:eventId/cancel` - Cancel event
- `GET /api/admin/abuse/logs` - Get abuse logs
- `POST /api/admin/abuse/logs/:logId/review` - Review abuse log
- `POST /api/admin/abuse/flag` - Flag user manually
- `GET /api/admin/abuse/user/:userId/activity` - Get user activity logs
- `POST /api/admin/abuse/user/:userId/leaderboard-visibility` - Hide/show user from leaderboard

## CRON Jobs

All CRON jobs are automatically started when the server starts:
- **Monthly Rollover**: 1st of every month at 00:00 UTC
- **Daily Validation**: Every day at 02:00 UTC
- **Friday Multiplier**: Every Friday at 00:00 UTC (applied automatically)
- **Leaderboard Snapshots**: Weekly (Sunday 03:00), Monthly (1st 03:00), Yearly (Jan 1st 03:00)
- **Top Chatter Update**: Daily at 04:00 UTC

## Models Created

1. **MonthlyCountHistory** - Stores monthly count history
2. **CountLog** - Logs all count actions for audit
3. **LeaderboardSnapshot** - Cached leaderboard snapshots
4. **AdminRuleConfig** - Admin-configurable rules (single document)
5. **Event** - Events with rewards
6. **AbuseLog** - Abuse detection and review logs

## User Model Updates

Added fields to User model:
- `currentMonthCount` - Current month's count
- `monthlyHistory` - Array of monthly counts
- `totalCount` - Lifetime total
- `countFrozen` - Freeze flag
- `hiddenFromLeaderboard` - Hide from leaderboard
- `isTopChatter` - Top chatter status
- `popularityBadge` - Badge level (bronze/silver/gold/platinum)

## Next Steps

1. Integrate count increments into existing controllers (chat, posts, likes, comments, shares)
2. Create frontend API slices
3. Create frontend UI components
4. Test the system thoroughly

