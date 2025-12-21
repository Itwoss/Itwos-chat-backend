import Notification from '../models/Notification.js';
import User from '../models/User.js';

// Get user notifications
export const getUserNotifications = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      console.error('[Notification Controller] No user in request');
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const userId = req.user._id;
    const { page = 1, limit = 20, unreadOnly = false } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = { userId };
    if (unreadOnly === 'true') {
      query.isRead = false;
    }

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Notification.countDocuments(query);
    const unreadCount = await Notification.countDocuments({ userId, isRead: false });

    res.status(200).json({
      success: true,
      data: notifications,
      unreadCount,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('[Notification Controller] Error fetching notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Mark notification as read
export const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const notification = await Notification.findOne({ _id: id, userId });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    notification.isRead = true;
    await notification.save();

    res.status(200).json({
      success: true,
      message: 'Notification marked as read',
      data: notification
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to mark notification as read',
      error: error.message
    });
  }
};

// Mark all notifications as read
export const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user._id;

    await Notification.updateMany(
      { userId, isRead: false },
      { isRead: true }
    );

    res.status(200).json({
      success: true,
      message: 'All notifications marked as read'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to mark notifications as read',
      error: error.message
    });
  }
};

// Delete notification
export const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const notification = await Notification.findOneAndDelete({ _id: id, userId });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Notification deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete notification',
      error: error.message
    });
  }
};

// Helper function to create notification (used by other controllers)
export const createNotification = async (userId, type, title, message, projectId = null, meetingId = null, link = null) => {
  try {
    const notification = await Notification.create({
      userId,
      type,
      title,
      message,
      projectId,
      meetingId,
      link
    });

    // Emit notification via Socket.IO
    try {
      // Use dynamic import to avoid circular dependency
      const serverModule = await import('../server.js');
      if (serverModule.emitNotification) {
        serverModule.emitNotification(userId.toString(), notification);
      }
    } catch (error) {
      console.error('Error emitting notification:', error);
    }

    return notification;
  } catch (error) {
    console.error('Error creating notification:', error);
    return null;
  }
};

// Helper function to create notification for all admins
export const createAdminNotification = async (type, title, message, projectId = null, meetingId = null, link = null) => {
  try {
    const User = (await import('../models/User.js')).default;
    const admins = await User.find({ role: 'admin', isActive: true }).select('_id');
    
    const notifications = await Promise.all(
      admins.map(admin => 
        Notification.create({
          userId: admin._id,
          type,
          title,
          message,
          projectId,
          meetingId,
          link
        })
      )
    );

    // Emit to admin room
    try {
      // Use dynamic import to avoid circular dependency
      const serverModule = await import('../server.js');
      if (serverModule.emitToAdminRoom) {
        // Emit to all admins
        notifications.forEach(notif => {
          serverModule.emitToAdminRoom(notif);
        });
      }
    } catch (error) {
      console.error('Error emitting admin notification:', error);
    }

    return notifications;
  } catch (error) {
    console.error('Error creating admin notifications:', error);
    return [];
  }
};

