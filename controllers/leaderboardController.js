import User from '../models/User.js';
import LeaderboardSnapshot from '../models/LeaderboardSnapshot.js';
import MonthlyCountHistory from '../models/MonthlyCountHistory.js';
import { getCurrentMonthYear } from '../services/countService.js';

/**
 * Get leaderboard with filters
 */
export const getLeaderboard = async (req, res) => {
  try {
    const {
      type = 'monthly', // weekly, monthly, yearly, lifetime
      region = 'global', // global, country, state, district
      country,
      state,
      district,
      page = 1,
      limit = 1000 // Default to 1000 to show all users (not just friends)
    } = req.query;

    const userId = req.user?.id;
    const skip = (page - 1) * limit;

    // Query for ALL users in the system (not filtered by friends)
    // Only filters: active, not blocked, not hidden, and role is 'user' (excludes admins)
    let query = {
      isActive: true,
      isBlocked: false,
      hiddenFromLeaderboard: false,
      role: 'user' // Exclude admin users from leaderboard
    };

    // Region filters
    if (region === 'country' && country) {
      query['address.country'] = country;
    }
    if (region === 'state' && state) {
      query['address.state'] = state;
    }
    if (region === 'district' && district) {
      query['address.district'] = district;
    }

    let sortField;
    let countField;

    // Determine count field based on type
    switch (type) {
      case 'weekly':
        // For weekly, use current month count (would need more sophisticated logic)
        countField = 'currentMonthCount';
        sortField = { currentMonthCount: -1 };
        break;
      case 'monthly':
        countField = 'currentMonthCount';
        sortField = { currentMonthCount: -1 };
        break;
      case 'yearly':
        // Sum of current year months
        // This would require aggregation
        countField = 'currentMonthCount'; // Placeholder
        sortField = { currentMonthCount: -1 };
        break;
      case 'lifetime':
        countField = 'totalCount';
        sortField = { totalCount: -1 };
        break;
      default:
        countField = 'currentMonthCount';
        sortField = { currentMonthCount: -1 };
    }

    // Get leaderboard - ALL users in system (no friend filtering)
    // This shows all active users regardless of friend status
    const users = await User.find(query)
      .select('name profileImage currentMonthCount totalCount address isTopChatter popularityBadge')
      .sort(sortField)
      .limit(parseInt(limit))
      .skip(skip)
      .lean();
    
    console.log(`[Leaderboard] Found ${users.length} users (showing all users, not just friends)`);

    // Add ranks
    const usersWithRanks = users.map((user, index) => ({
      ...user,
      rank: skip + index + 1,
      count: user[countField] || 0
    }));

    // Find current user's rank if logged in
    let userRank = null;
    if (userId) {
      const user = await User.findById(userId).select('currentMonthCount totalCount address role').lean();
      if (user && !user.hiddenFromLeaderboard && !user.isBlocked && user.role === 'user') {
        const userCount = user[countField] || 0;
        
        // Count users above
        const aboveQuery = { ...query };
        aboveQuery[countField] = { $gt: userCount };
        const aboveCount = await User.countDocuments(aboveQuery);
        
        userRank = {
          rank: aboveCount + 1,
          count: userCount,
          user: {
            name: user.name,
            profileImage: user.profileImage
          }
        };
      }
    }

    // Get users above and below current user
    let aboveUsers = [];
    let belowUsers = [];

    if (userRank) {
      const aboveLimit = 5;
      const belowLimit = 5;

      // Users above
      const aboveQuery = { ...query };
      aboveQuery[countField] = { $gt: userRank.count };
      aboveUsers = await User.find(aboveQuery)
        .select('name profileImage currentMonthCount totalCount')
        .sort(sortField)
        .limit(aboveLimit)
        .lean();

      // Users below
      const belowQuery = { ...query };
      belowQuery[countField] = { $lt: userRank.count };
      belowUsers = await User.find(belowQuery)
        .select('name profileImage currentMonthCount totalCount')
        .sort({ [countField]: -1 })
        .limit(belowLimit)
        .lean();
    }

    const total = await User.countDocuments(query);

    res.json({
      success: true,
      data: {
        leaderboard: usersWithRanks,
        userRank,
        aboveUsers: aboveUsers.map((u, i) => ({
          ...u,
          rank: userRank.rank - aboveUsers.length + i,
          count: u[countField] || 0
        })),
        belowUsers: belowUsers.map((u, i) => ({
          ...u,
          rank: userRank.rank + i + 1,
          count: u[countField] || 0
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        },
        filters: {
          type,
          region,
          country,
          state,
          district
        }
      }
    });
  } catch (error) {
    console.error('[LeaderboardController] Error getting leaderboard:', error);
    res.status(500).json({ success: false, message: 'Failed to get leaderboard' });
  }
};

/**
 * Get leaderboard snapshot (cached)
 */
export const getLeaderboardSnapshot = async (req, res) => {
  try {
    const {
      snapshotType = 'monthly',
      period,
      region = 'global',
      country,
      state,
      district
    } = req.query;

    const regionObj = {
      type: region,
      country,
      state,
      district
    };

    const snapshot = await LeaderboardSnapshot.findOne({
      snapshotType,
      period: period || getCurrentMonthYear(),
      region: regionObj
    })
      .populate('rankings.user', 'name profileImage')
      .sort({ generatedAt: -1 });

    if (!snapshot) {
      return res.status(404).json({
        success: false,
        message: 'Snapshot not found'
      });
    }

    res.json({
      success: true,
      data: snapshot
    });
  } catch (error) {
    console.error('[LeaderboardController] Error getting snapshot:', error);
    res.status(500).json({ success: false, message: 'Failed to get snapshot' });
  }
};

/**
 * Get user's rank history
 */
export const getUserRankHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { type = 'monthly' } = req.query;

    let history = [];

    if (type === 'monthly') {
      history = await MonthlyCountHistory.find({ user: userId })
        .sort({ monthYear: -1 })
        .limit(12)
        .lean();
    } else {
      // For yearly or lifetime, would need aggregation
      const user = await User.findById(userId).select('monthlyHistory').lean();
      history = user?.monthlyHistory || [];
    }

    res.json({
      success: true,
      data: { history }
    });
  } catch (error) {
    console.error('[LeaderboardController] Error getting rank history:', error);
    res.status(500).json({ success: false, message: 'Failed to get rank history' });
  }
};

