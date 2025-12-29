import User from '../models/User.js';
import CountLog from '../models/CountLog.js';
import AdminRuleConfig from '../models/AdminRuleConfig.js';
import AbuseLog from '../models/AbuseLog.js';
import crypto from 'crypto';

/**
 * Get current month-year string (e.g., "Jan-2025")
 */
export const getCurrentMonthYear = () => {
  const now = new Date();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[now.getMonth()]}-${now.getFullYear()}`;
};

/**
 * Check if today is Friday
 */
export const isFriday = () => {
  const today = new Date();
  return today.getDay() === 5; // 5 = Friday
};

/**
 * Generate hash for message content to detect duplicates
 */
export const hashMessage = (content) => {
  return crypto.createHash('md5').update(content.toLowerCase().trim()).digest('hex');
};

/**
 * Check if user pair already counted today for chat
 */
export const hasChatCountedToday = async (userId, recipientId, monthYear) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const existingLog = await CountLog.findOne({
    user: userId,
    actionType: 'chat',
    monthYear,
    isValid: true,
    'metadata.recipientId': recipientId,
    createdAt: {
      $gte: today,
      $lt: tomorrow
    }
  });

  return !!existingLog;
};

/**
 * Check if message is duplicate (same hash in last 24 hours)
 */
export const isDuplicateMessage = async (userId, messageHash, monthYear) => {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const duplicate = await CountLog.findOne({
    user: userId,
    actionType: 'chat',
    monthYear,
    'metadata.messageHash': messageHash,
    createdAt: { $gte: twentyFourHoursAgo }
  });

  return !!duplicate;
};

/**
 * Check if media was reused
 */
export const isMediaReused = async (userId, mediaType, mediaHash, monthYear) => {
  const existingLog = await CountLog.findOne({
    user: userId,
    actionType: { $in: ['chat', 'post_like', 'comment', 'share'] },
    monthYear,
    [`metadata.${mediaType}Hash`]: mediaHash
  });

  return !!existingLog;
};

/**
 * Add count to user (with validation and anti-spam checks)
 */
export const addCount = async (userId, actionType, count, metadata = {}) => {
  try {
    const user = await User.findById(userId);
    if (!user || user.countFrozen || user.isBlocked) {
      return { success: false, message: 'User not found or count frozen' };
    }

    const config = await AdminRuleConfig.getConfig();
    if (!config.enabled) {
      return { success: false, message: 'Count system disabled' };
    }

    const monthYear = getCurrentMonthYear();
    let finalCount = count;

    // Apply Friday multiplier if enabled and it's Friday
    if (config.fridayMultiplier.enabled && isFriday() && actionType !== 'admin_adjustment') {
      finalCount = count * config.fridayMultiplier.multiplier;
    }

    // Validate action based on type
    let isValid = true;
    let flagForReview = false;

    if (actionType === 'chat') {
      // Check daily limit per user pair
      if (metadata.recipientId) {
        const alreadyCounted = await hasChatCountedToday(userId, metadata.recipientId, monthYear);
        if (alreadyCounted) {
          isValid = false;
        }
      }

      // Check for duplicate message
      if (metadata.messageHash) {
        const isDuplicate = await isDuplicateMessage(userId, metadata.messageHash, monthYear);
        if (isDuplicate) {
          isValid = false;
          flagForReview = true;
        }
      }

      // Check if message text is different (if required)
      if (config.chatRequireDifferentText && metadata.messageText) {
        // This would need more sophisticated text comparison
        // For now, we rely on messageHash
      }
    }

    // Check media reuse
    if (metadata.imageHash && config.preventImageReuse) {
      const reused = await isMediaReused(userId, 'image', metadata.imageHash, monthYear);
      if (reused) {
        isValid = false;
        flagForReview = true;
      }
    }

    if (metadata.audioHash && config.preventAudioReuse) {
      const reused = await isMediaReused(userId, 'audio', metadata.audioHash, monthYear);
      if (reused) {
        isValid = false;
        flagForReview = true;
      }
    }

    // Check daily action limit
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayActions = await CountLog.countDocuments({
      user: userId,
      monthYear,
      isValid: true,
      createdAt: {
        $gte: today,
        $lt: tomorrow
      }
    });

    if (todayActions >= config.spamDetection.maxDailyActions) {
      isValid = false;
      flagForReview = true;

      // Log abuse
      await AbuseLog.create({
        user: userId,
        abuseType: 'daily_limit_exceeded',
        severity: 'high',
        description: `User exceeded daily action limit: ${todayActions}`,
        evidence: { count: todayActions }
      });
    }

    // Create count log
    const countLog = await CountLog.create({
      user: userId,
      actionType,
      count: finalCount,
      metadata: {
        ...metadata,
        fridayMultiplier: isFriday() && config.fridayMultiplier.enabled ? config.fridayMultiplier.multiplier : 1
      },
      monthYear,
      isValid,
      flaggedForReview: flagForReview
    });

    // Only add to user count if valid
    if (isValid) {
      user.currentMonthCount += finalCount;
      user.totalCount += finalCount;
      await user.save();
    }

    // Flag for review if needed
    if (flagForReview) {
      await AbuseLog.create({
        user: userId,
        abuseType: getAbuseTypeFromAction(actionType),
        severity: 'medium',
        description: `Suspicious activity detected: ${actionType}`,
        evidence: {
          countLogIds: [countLog._id]
        }
      });
    }

    return {
      success: isValid,
      count: isValid ? finalCount : 0,
      flagged: flagForReview,
      message: isValid ? 'Count added successfully' : 'Count invalid or flagged for review'
    };
  } catch (error) {
    console.error('[CountService] Error adding count:', error);
    return { success: false, message: error.message };
  }
};

/**
 * Get abuse type from action type
 */
const getAbuseTypeFromAction = (actionType) => {
  const mapping = {
    'chat': 'duplicate_message',
    'post_like': 'like_farming',
    'comment': 'comment_farming',
    'share': 'share_farming'
  };
  return mapping[actionType] || 'suspicious_pattern';
};

/**
 * Check and apply milestone rewards
 */
export const checkMilestoneRewards = async (userId) => {
  try {
    const config = await AdminRuleConfig.getConfig();
    const user = await User.findById(userId);
    if (!user) return;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - config.milestoneRewards.likesWindowDays);

    // Check likes milestone (would need to query Post model)
    // This is a placeholder - actual implementation would query Post likes
    // const likesCount = await Post.countDocuments({ likedBy: userId, createdAt: { $gte: thirtyDaysAgo } });
    
    // Similar for comments and shares
    // Implementation would depend on your Post/Comment models

    // For now, return placeholder
    return { applied: false };
  } catch (error) {
    console.error('[CountService] Error checking milestones:', error);
    return { applied: false };
  }
};

/**
 * Get user count summary
 */
export const getUserCountSummary = async (userId) => {
  try {
    const user = await User.findById(userId)
      .select('currentMonthCount monthlyHistory totalCount isTopChatter popularityBadge');

    if (!user) {
      return { success: false, message: 'User not found' };
    }

    return {
      success: true,
      data: {
        currentMonthCount: user.currentMonthCount,
        monthlyHistory: user.monthlyHistory,
        totalCount: user.totalCount,
        isTopChatter: user.isTopChatter,
        popularityBadge: user.popularityBadge
      }
    };
  } catch (error) {
    console.error('[CountService] Error getting count summary:', error);
    return { success: false, message: error.message };
  }
};

