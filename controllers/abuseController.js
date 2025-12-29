import AbuseLog from '../models/AbuseLog.js';
import User from '../models/User.js';
import CountLog from '../models/CountLog.js';

/**
 * Get abuse logs (admin)
 */
export const getAbuseLogs = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const {
      status = 'pending',
      severity,
      abuseType,
      userId,
      page = 1,
      limit = 50
    } = req.query;

    const query = {};
    if (status) query.status = status;
    if (severity) query.severity = severity;
    if (abuseType) query.abuseType = abuseType;
    if (userId) query.user = userId;

    const logs = await AbuseLog.find(query)
      .populate('user', 'name email profileImage')
      .populate('reviewedBy', 'name email')
      .populate('flaggedByUser', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    const total = await AbuseLog.countDocuments(query);

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
    console.error('[AbuseController] Error getting abuse logs:', error);
    res.status(500).json({ success: false, message: 'Failed to get abuse logs' });
  }
};

/**
 * Review abuse log (admin)
 */
export const reviewAbuseLog = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const { logId } = req.params;
    const { status, actionTaken, reviewNotes } = req.body;

    const log = await AbuseLog.findById(logId);
    if (!log) {
      return res.status(404).json({ success: false, message: 'Abuse log not found' });
    }

    log.status = status || 'reviewed';
    log.actionTaken = actionTaken || 'none';
    log.reviewNotes = reviewNotes;
    log.reviewedBy = req.user.id;
    log.reviewedAt = new Date();

    // Apply action if needed
    if (actionTaken && actionTaken !== 'none') {
      const user = await User.findById(log.user);
      if (user) {
        switch (actionTaken) {
          case 'count_reduction':
            // Would need amount from request
            const reductionAmount = req.body.reductionAmount || 0;
            user.currentMonthCount = Math.max(0, user.currentMonthCount - reductionAmount);
            user.totalCount = Math.max(0, user.totalCount - reductionAmount);
            await user.save();
            break;
          case 'count_freeze':
            user.countFrozen = true;
            await user.save();
            break;
          case 'warning':
            // Add warning to user
            user.warnings.push({
              type: 'general',
              reason: reviewNotes || 'Abuse detected',
              warnedBy: req.user.id
            });
            await user.save();
            break;
          case 'temporary_ban':
          case 'permanent_ban':
            user.isBlocked = true;
            user.blockedAt = new Date();
            user.blockedReason = reviewNotes || 'Abuse violation';
            await user.save();
            break;
        }
      }
    }

    await log.save();

    res.json({
      success: true,
      message: 'Abuse log reviewed successfully',
      data: log
    });
  } catch (error) {
    console.error('[AbuseController] Error reviewing abuse log:', error);
    res.status(500).json({ success: false, message: 'Failed to review abuse log' });
  }
};

/**
 * Flag user manually (admin)
 */
export const flagUser = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const { userId, abuseType, severity, description, evidence } = req.body;

    if (!userId || !abuseType || !description) {
      return res.status(400).json({
        success: false,
        message: 'userId, abuseType, and description are required'
      });
    }

    const log = await AbuseLog.create({
      user: userId,
      abuseType,
      severity: severity || 'medium',
      description,
      evidence: evidence || {},
      flaggedBy: 'admin',
      flaggedByUser: req.user.id
    });

    res.status(201).json({
      success: true,
      message: 'User flagged successfully',
      data: log
    });
  } catch (error) {
    console.error('[AbuseController] Error flagging user:', error);
    res.status(500).json({ success: false, message: 'Failed to flag user' });
  }
};

/**
 * Get user activity logs for inspection (admin)
 */
export const getUserActivityLogs = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const { userId } = req.params;
    const { monthYear, page = 1, limit = 100 } = req.query;

    const query = { user: userId };
    if (monthYear) query.monthYear = monthYear;

    const logs = await CountLog.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

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
    console.error('[AbuseController] Error getting user activity logs:', error);
    res.status(500).json({ success: false, message: 'Failed to get activity logs' });
  }
};

/**
 * Hide user from leaderboard (admin)
 */
export const toggleLeaderboardVisibility = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const { userId } = req.params;
    const { hidden } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.hiddenFromLeaderboard = hidden !== undefined ? hidden : !user.hiddenFromLeaderboard;
    await user.save();

    res.json({
      success: true,
      message: `User ${user.hiddenFromLeaderboard ? 'hidden from' : 'shown on'} leaderboard`,
      data: { hiddenFromLeaderboard: user.hiddenFromLeaderboard }
    });
  } catch (error) {
    console.error('[AbuseController] Error toggling leaderboard visibility:', error);
    res.status(500).json({ success: false, message: 'Failed to toggle visibility' });
  }
};

