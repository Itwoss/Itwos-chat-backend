import Story from '../models/Story.js';
import StoryInteraction from '../models/StoryInteraction.js';
import User from '../models/User.js';
import { createNotification } from './notificationController.js';
import mongoose from 'mongoose';

// Get all stories (admin)
export const getAllStories = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, userId, search } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = {};

    if (status === 'active') {
      query.isActive = true;
      query.expiresAt = { $gt: new Date() };
    } else if (status === 'expired') {
      query.expiresAt = { $lte: new Date() };
    } else if (status === 'inactive') {
      query.isActive = false;
    }

    if (userId) {
      query.user = userId;
    }

    if (search) {
      query.caption = { $regex: search, $options: 'i' };
    }

    const stories = await Story.find(query)
      .populate('user', 'name email profileImage')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Story.countDocuments(query);

    res.status(200).json({
      success: true,
      data: stories,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('[Admin Story Controller] Error fetching stories:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch stories',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
};

// Get story statistics
export const getStoryStats = async (req, res) => {
  try {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [
      totalStories,
      activeStories,
      expiredStories,
      storiesLast24h,
      totalViews,
      totalLikes,
      totalReplies,
      topUsers,
    ] = await Promise.all([
      Story.countDocuments(),
      Story.countDocuments({ isActive: true, expiresAt: { $gt: now } }),
      Story.countDocuments({ expiresAt: { $lte: now } }),
      Story.countDocuments({ createdAt: { $gte: oneDayAgo } }),
      StoryInteraction.countDocuments({ type: 'view' }),
      StoryInteraction.countDocuments({ type: 'like' }),
      StoryInteraction.countDocuments({ type: 'reply' }),
      Story.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$user', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'user',
          },
        },
        { $unwind: '$user' },
        { $project: { _id: 1, name: '$user.name', email: '$user.email', count: 1 } },
      ]),
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalStories,
        activeStories,
        expiredStories,
        storiesLast24h,
        totalViews,
        totalLikes,
        totalReplies,
        topUsers,
      },
    });
  } catch (error) {
    console.error('[Admin Story Controller] Error fetching stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch story statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
};

// Get a single story by ID (admin)
export const getStoryById = async (req, res) => {
  try {
    const { id } = req.params;

    const story = await Story.findById(id)
      .populate('user', 'name email profileImage')
      .populate('taggedUsers', 'name profileImage');

    if (!story) {
      return res.status(404).json({
        success: false,
        message: 'Story not found',
      });
    }

    res.status(200).json({
      success: true,
      data: story,
    });
  } catch (error) {
    console.error('[Admin Story Controller] Error fetching story:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch story',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
};

// Remove story (admin) - violates policy
export const removeStory = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, warnUser = true } = req.body;
    const adminId = req.user._id;

    if (!reason || reason.trim().length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Removal reason must be at least 10 characters'
      });
    }

    const story = await Story.findById(id).populate('user');
    if (!story) {
      return res.status(404).json({
        success: false,
        message: 'Story not found'
      });
    }

    if (story.isRemoved) {
      return res.status(400).json({
        success: false,
        message: 'Story is already removed'
      });
    }

    const author = await User.findById(story.user._id || story.user);
    if (!author) {
      return res.status(404).json({
        success: false,
        message: 'Story author not found'
      });
    }

    // Mark story as removed
    story.isRemoved = true;
    story.isActive = false;
    story.removedBy = adminId;
    story.removedAt = new Date();
    story.removalReason = reason.trim();
    await story.save();

    // Add warning to user if requested
    if (warnUser) {
      if (!author.warnings) {
        author.warnings = [];
      }
      
      author.warnings.push({
        type: 'story',
        reason: reason.trim(),
        contentId: story._id,
        contentType: 'Story',
        warnedBy: adminId,
        warnedAt: new Date()
      });

      await author.save();

      // Create notification for user
      await createNotification(
        author._id,
        'message',
        '⚠️ Story Removed - Policy Violation',
        `Your story has been removed for violating our community guidelines.\n\nReason: ${reason.trim()}\n\nPlease review our community policies to avoid future violations. Repeated violations may result in account restrictions.`,
        null,
        null,
        '/user/stories'
      );
    }

    res.status(200).json({
      success: true,
      message: 'Story removed successfully',
      data: {
        storyId: story._id,
        warned: warnUser
      }
    });
  } catch (error) {
    console.error('[Admin Story Controller] Error removing story:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove story',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Delete a story (admin) - legacy support
export const deleteStory = async (req, res) => {
  try {
    const { id } = req.params;

    const story = await Story.findById(id);
    if (!story) {
      return res.status(404).json({
        success: false,
        message: 'Story not found',
      });
    }

    story.isActive = false;
    story.isRemoved = true;
    await story.save();

    res.status(200).json({
      success: true,
      message: 'Story deleted successfully',
    });
  } catch (error) {
    console.error('[Admin Story Controller] Error deleting story:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete story',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
};

// Block user from posting stories
export const blockUserFromStories = async (req, res) => {
  try {
    const { userId } = req.params;
    const { blocked } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Add a field to track if user is blocked from posting stories
    // For now, we'll use a simple approach - you can extend User model if needed
    user.storyBlocked = blocked !== false;
    await user.save();

    res.status(200).json({
      success: true,
      message: `User ${blocked !== false ? 'blocked' : 'unblocked'} from posting stories`,
    });
  } catch (error) {
    console.error('[Admin Story Controller] Error blocking user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user story access',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
};

// Get story interactions (admin)
export const getStoryInteractions = async (req, res) => {
  try {
    const { id } = req.params;
    const { type, page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = { story: id };
    if (type) {
      query.type = type;
    }

    const interactions = await StoryInteraction.find(query)
      .populate('viewer', 'name email profileImage')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await StoryInteraction.countDocuments(query);

    res.status(200).json({
      success: true,
      data: interactions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('[Admin Story Controller] Error fetching interactions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch story interactions',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
};



