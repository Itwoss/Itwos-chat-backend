import { addCount, getUserCountSummary } from '../services/countService.js';
import User from '../models/User.js';
import CountLog from '../models/CountLog.js';
import Event from '../models/Event.js';

/**
 * Get user's count summary
 */
export const getUserCount = async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await getUserCountSummary(userId);

    if (!result.success) {
      return res.status(404).json({ success: false, message: result.message });
    }

    res.json({ success: true, data: result.data });
  } catch (error) {
    console.error('[CountController] Error getting user count:', error);
    res.status(500).json({ success: false, message: 'Failed to get user count' });
  }
};

/**
 * Get count logs for user (for debugging/admin)
 */
export const getCountLogs = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 50, monthYear, actionType } = req.query;

    const query = { user: userId };
    if (monthYear) query.monthYear = monthYear;
    if (actionType) query.actionType = actionType;

    const logs = await CountLog.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('metadata.postId', 'title')
      .populate('metadata.chatId', 'participants');

    const total = await CountLog.countDocuments(query);

    res.json({
      success: true,
      data: {
        logs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('[CountController] Error getting count logs:', error);
    res.status(500).json({ success: false, message: 'Failed to get count logs' });
  }
};

/**
 * Admin: Manually adjust user count
 */
export const adjustUserCount = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const { userId, count, reason } = req.body;

    if (!userId || count === undefined) {
      return res.status(400).json({ success: false, message: 'userId and count are required' });
    }

    const result = await addCount(userId, 'admin_adjustment', count, {
      adjustedBy: req.user.id,
      reason: reason || 'Manual adjustment by admin',
      description: `Admin adjustment: ${count > 0 ? '+' : ''}${count}`
    });

    if (!result.success) {
      return res.status(400).json({ success: false, message: result.message });
    }

    res.json({
      success: true,
      message: 'Count adjusted successfully',
      data: { count: result.count }
    });
  } catch (error) {
    console.error('[CountController] Error adjusting count:', error);
    res.status(500).json({ success: false, message: 'Failed to adjust count' });
  }
};

/**
 * Admin: Reset user's monthly count
 */
export const resetMonthlyCount = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.currentMonthCount = 0;
    await user.save();

    res.json({
      success: true,
      message: 'Monthly count reset successfully'
    });
  } catch (error) {
    console.error('[CountController] Error resetting monthly count:', error);
    res.status(500).json({ success: false, message: 'Failed to reset monthly count' });
  }
};

/**
 * Admin: Freeze/unfreeze user count
 */
export const toggleCountFreeze = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const { userId } = req.params;
    const { frozen } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.countFrozen = frozen !== undefined ? frozen : !user.countFrozen;
    await user.save();

    res.json({
      success: true,
      message: `Count ${user.countFrozen ? 'frozen' : 'unfrozen'} successfully`,
      data: { countFrozen: user.countFrozen }
    });
  } catch (error) {
    console.error('[CountController] Error toggling count freeze:', error);
    res.status(500).json({ success: false, message: 'Failed to toggle count freeze' });
  }
};

/**
 * Admin: Get count dashboard statistics
 */
export const getCountDashboardStats = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Get stats in parallel
    const [
      totalUsers,
      thisMonthTotalCounts,
      activeEvents,
      topChattersCount
    ] = await Promise.all([
      // Total users with count system (exclude admins)
      User.countDocuments({ 
        role: 'user',
        isActive: true,
        $or: [
          { currentMonthCount: { $gt: 0 } },
          { totalCount: { $gt: 0 } }
        ]
      }),

      // Total counts generated this month
      User.aggregate([
        {
          $match: {
            role: 'user',
            isActive: true
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$currentMonthCount' }
          }
        }
      ]).then(result => result[0]?.total || 0),

      // Active events (not cancelled, within date range)
      Event.countDocuments({
        isActive: true,
        isCancelled: false,
        startDate: { $lte: now },
        endDate: { $gte: now }
      }),

      // Top chatters this month
      User.countDocuments({
        role: 'user',
        isActive: true,
        isTopChatter: true
      })
    ]);

    res.json({
      success: true,
      data: {
        totalUsers,
        thisMonthTotalCounts,
        activeEvents,
        topChattersCount
      }
    });
  } catch (error) {
    console.error('[CountController] Error getting dashboard stats:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get dashboard stats',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

