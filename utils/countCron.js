import cron from 'node-cron';
import User from '../models/User.js';
import MonthlyCountHistory from '../models/MonthlyCountHistory.js';
import LeaderboardSnapshot from '../models/LeaderboardSnapshot.js';
import CountLog from '../models/CountLog.js';
import AdminRuleConfig from '../models/AdminRuleConfig.js';
import AbuseLog from '../models/AbuseLog.js';
import { getCurrentMonthYear, isFriday } from '../services/countService.js';

/**
 * Monthly Rollover Job
 * Runs at 00:00 on the 1st of every month
 */
export const startMonthlyRolloverCron = () => {
  cron.schedule('0 0 1 * *', async () => {
    console.log('[CountCron] Starting monthly rollover...');
    
    try {
      const previousMonth = new Date();
      previousMonth.setMonth(previousMonth.getMonth() - 1);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const previousMonthYear = `${months[previousMonth.getMonth()]}-${previousMonth.getFullYear()}`;
      
      // Get all active users (exclude admins)
      const users = await User.find({ isActive: true, isBlocked: false, role: 'user' });
      
      let processed = 0;
      
      for (const user of users) {
        if (user.countFrozen) continue; // Skip frozen users
        
        const monthCount = user.currentMonthCount || 0;
        
        // Save to monthly history
        await MonthlyCountHistory.findOneAndUpdate(
          { user: user._id, monthYear: previousMonthYear },
          {
            user: user._id,
            monthYear: previousMonthYear,
            count: monthCount,
            breakdown: {
              chatCount: 0, // Would need to aggregate from CountLog
              postLikesCount: 0,
              commentsCount: 0,
              sharesCount: 0,
              eventBonus: 0,
              fridayMultiplier: 0,
              other: 0
            }
          },
          { upsert: true, new: true }
        );
        
        // Update user's monthly history array
        const existingHistory = user.monthlyHistory.find(h => h.monthYear === previousMonthYear);
        if (existingHistory) {
          existingHistory.count = monthCount;
        } else {
          user.monthlyHistory.push({
            monthYear: previousMonthYear,
            count: monthCount
          });
        }
        
        // Reset current month count
        user.currentMonthCount = 0;
        user.lastCountReset = new Date();
        
        await user.save();
        processed++;
      }
      
      console.log(`[CountCron] Monthly rollover completed. Processed ${processed} users.`);
    } catch (error) {
      console.error('[CountCron] Error in monthly rollover:', error);
    }
  }, {
    scheduled: true,
    timezone: 'UTC'
  });
  
  console.log('[CountCron] Monthly rollover job scheduled (1st of every month at 00:00 UTC)');
};

/**
 * Daily Validation Job
 * Runs daily at 02:00 UTC
 */
export const startDailyValidationCron = () => {
  cron.schedule('0 2 * * *', async () => {
    console.log('[CountCron] Starting daily validation...');
    
    try {
      const config = await AdminRuleConfig.getConfig();
      if (!config.enabled || !config.spamDetection.enabled) {
        return;
      }
      
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Find users who exceeded daily limits
      const suspiciousLogs = await CountLog.aggregate([
        {
          $match: {
            createdAt: { $gte: yesterday, $lt: today },
            isValid: true
          }
        },
        {
          $group: {
            _id: '$user',
            count: { $sum: 1 },
            actions: { $push: '$$ROOT' }
          }
        },
        {
          $match: {
            count: { $gte: config.spamDetection.maxDailyActions }
          }
        }
      ]);
      
      for (const suspicious of suspiciousLogs) {
        // Check if already flagged
        const existingLog = await AbuseLog.findOne({
          user: suspicious._id,
          abuseType: 'daily_limit_exceeded',
          createdAt: { $gte: yesterday }
        });
        
        if (!existingLog) {
          await AbuseLog.create({
            user: suspicious._id,
            abuseType: 'daily_limit_exceeded',
            severity: 'high',
            description: `User exceeded daily action limit: ${suspicious.count} actions`,
            evidence: {
              countLogIds: suspicious.actions.map(a => a._id),
              count: suspicious.count
            }
          });
        }
      }
      
      // Validate duplicate messages
      const duplicateMessages = await CountLog.aggregate([
        {
          $match: {
            actionType: 'chat',
            'metadata.messageHash': { $exists: true },
            createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
          }
        },
        {
          $group: {
            _id: {
              user: '$user',
              messageHash: '$metadata.messageHash'
            },
            count: { $sum: 1 },
            logs: { $push: '$$ROOT' }
          }
        },
        {
          $match: {
            count: { $gt: 1 }
          }
        }
      ]);
      
      for (const duplicate of duplicateMessages) {
        // Mark all but first as invalid
        const logsToInvalidate = duplicate.logs.slice(1);
        for (const log of logsToInvalidate) {
          await CountLog.findByIdAndUpdate(log._id, {
            isValid: false,
            flaggedForReview: true
          });
          
          // Reduce user count
          const user = await User.findById(log.user);
          if (user) {
            user.currentMonthCount = Math.max(0, user.currentMonthCount - log.count);
            user.totalCount = Math.max(0, user.totalCount - log.count);
            await user.save();
          }
        }
      }
      
      console.log('[CountCron] Daily validation completed.');
    } catch (error) {
      console.error('[CountCron] Error in daily validation:', error);
    }
  }, {
    scheduled: true,
    timezone: 'UTC'
  });
  
  console.log('[CountCron] Daily validation job scheduled (daily at 02:00 UTC)');
};

/**
 * Friday Multiplier Job
 * Runs every Friday at 00:00 UTC
 */
export const startFridayMultiplierCron = () => {
  cron.schedule('0 0 * * 5', async () => {
    console.log('[CountCron] Friday detected - multiplier will be applied automatically');
    // The multiplier is applied in real-time in the countService
    // This job just logs that it's Friday
  }, {
    scheduled: true,
    timezone: 'UTC'
  });
  
  console.log('[CountCron] Friday multiplier job scheduled (every Friday at 00:00 UTC)');
};

/**
 * Leaderboard Snapshot Job
 * Runs weekly on Sunday at 03:00 UTC and monthly on 1st at 03:00 UTC
 */
export const startLeaderboardSnapshotCron = () => {
  // Weekly snapshot (every Sunday)
  cron.schedule('0 3 * * 0', async () => {
    console.log('[CountCron] Creating weekly leaderboard snapshot...');
    await createLeaderboardSnapshot('weekly');
  }, {
    scheduled: true,
    timezone: 'UTC'
  });
  
  // Monthly snapshot (1st of every month)
  cron.schedule('0 3 1 * *', async () => {
    console.log('[CountCron] Creating monthly leaderboard snapshot...');
    await createLeaderboardSnapshot('monthly');
  }, {
    scheduled: true,
    timezone: 'UTC'
  });
  
  // Yearly snapshot (January 1st)
  cron.schedule('0 3 1 1 *', async () => {
    console.log('[CountCron] Creating yearly leaderboard snapshot...');
    await createLeaderboardSnapshot('yearly');
  }, {
    scheduled: true,
    timezone: 'UTC'
  });
  
  console.log('[CountCron] Leaderboard snapshot jobs scheduled');
};

/**
 * Helper function to create leaderboard snapshot
 */
const createLeaderboardSnapshot = async (type) => {
  try {
    const now = new Date();
    let period;
    
    if (type === 'weekly') {
      const week = getWeekNumber(now);
      period = `${now.getFullYear()}-W${week}`;
    } else if (type === 'monthly') {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      period = `${months[now.getMonth()]}-${now.getFullYear()}`;
    } else if (type === 'yearly') {
      period = `${now.getFullYear()}`;
    }
    
    // Create global snapshot
    await createSnapshotForRegion(type, period, 'global');
    
    // Create country-based snapshots (top countries)
    const topCountries = await User.distinct('address.country', {
      'address.country': { $exists: true, $ne: null },
      role: 'user'
    });
    
    for (const country of topCountries.slice(0, 10)) { // Limit to top 10 countries
      await createSnapshotForRegion(type, period, 'country', { country });
    }
    
    console.log(`[CountCron] ${type} leaderboard snapshot created for period ${period}`);
  } catch (error) {
    console.error(`[CountCron] Error creating ${type} snapshot:`, error);
  }
};

/**
 * Helper to create snapshot for a specific region
 */
const createSnapshotForRegion = async (type, period, regionType, regionData = {}) => {
  try {
    let query = { isActive: true, isBlocked: false, hiddenFromLeaderboard: false, role: 'user' };
    let sortField;
    
    if (type === 'lifetime') {
      sortField = { totalCount: -1 };
    } else {
      sortField = { currentMonthCount: -1 };
    }
    
    if (regionType === 'country' && regionData.country) {
      query['address.country'] = regionData.country;
    }
    if (regionType === 'state' && regionData.state) {
      query['address.state'] = regionData.state;
    }
    if (regionType === 'district' && regionData.district) {
      query['address.district'] = regionData.district;
    }
    
    const users = await User.find(query)
      .select('_id')
      .sort(sortField)
      .limit(1000)
      .lean();
    
    const rankings = users.map((user, index) => ({
      user: user._id,
      rank: index + 1,
      count: type === 'lifetime' ? user.totalCount : user.currentMonthCount
    }));
    
    await LeaderboardSnapshot.findOneAndUpdate(
      {
        snapshotType: type,
        period,
        region: {
          type: regionType,
          ...regionData
        }
      },
      {
        snapshotType: type,
        period,
        region: {
          type: regionType,
          ...regionData
        },
        rankings,
        totalUsers: users.length,
        generatedAt: new Date()
      },
      { upsert: true, new: true }
    );
  } catch (error) {
    console.error(`[CountCron] Error creating snapshot for ${regionType}:`, error);
  }
};

/**
 * Get week number
 */
const getWeekNumber = (date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
};

/**
 * Update Top Chatter status
 * Runs daily at 04:00 UTC
 */
export const startTopChatterUpdateCron = () => {
  cron.schedule('0 4 * * *', async () => {
    console.log('[CountCron] Updating top chatter status...');
    
    try {
      const config = await AdminRuleConfig.getConfig();
      
      // Reset all top chatter status
      await User.updateMany({}, { isTopChatter: false });
      
      // Find users who meet monthly threshold (exclude admins)
      const monthlyTopChatters = await User.find({
        isActive: true,
        isBlocked: false,
        role: 'user',
        currentMonthCount: { $gte: config.topChatterThreshold.monthly }
      }).select('_id');
      
      await User.updateMany(
        { _id: { $in: monthlyTopChatters.map(u => u._id) } },
        { isTopChatter: true }
      );
      
      // Update popularity badges based on total count (exclude admins)
      await User.updateMany(
        { role: 'user', totalCount: { $gte: 50000 } },
        { popularityBadge: 'platinum' }
      );
      await User.updateMany(
        { role: 'user', totalCount: { $gte: 25000, $lt: 50000 } },
        { popularityBadge: 'gold' }
      );
      await User.updateMany(
        { role: 'user', totalCount: { $gte: 10000, $lt: 25000 } },
        { popularityBadge: 'silver' }
      );
      await User.updateMany(
        { role: 'user', totalCount: { $gte: 5000, $lt: 10000 } },
        { popularityBadge: 'bronze' }
      );
      
      console.log(`[CountCron] Top chatter status updated. ${monthlyTopChatters.length} users marked as top chatters.`);
    } catch (error) {
      console.error('[CountCron] Error updating top chatter status:', error);
    }
  }, {
    scheduled: true,
    timezone: 'UTC'
  });
  
  console.log('[CountCron] Top chatter update job scheduled (daily at 04:00 UTC)');
};

/**
 * Initialize all count-related CRON jobs
 */
export const startCountCronJobs = () => {
  startMonthlyRolloverCron();
  startDailyValidationCron();
  startFridayMultiplierCron();
  startLeaderboardSnapshotCron();
  startTopChatterUpdateCron();
  console.log('[CountCron] All count-related CRON jobs initialized');
};

