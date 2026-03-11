import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { generateToken } from '../utils/generateToken.js';
import { validationResult } from 'express-validator';
import cloudinary from '../utils/cloudinary.js';
import Project from '../models/Project.js';
import Team from '../models/Team.js';
import DemoBooking from '../models/DemoBooking.js';
import ClientProject from '../models/ClientProject.js';
import Meeting from '../models/Meeting.js';
import Chat from '../models/Chat.js';
import Message from '../models/Message.js';
import FriendRequest from '../models/FriendRequest.js';
import Post from '../models/Post.js';
import Story from '../models/Story.js';
import Subscription from '../models/Subscription.js';
import Banner from '../models/Banner.js';
import Notification from '../models/Notification.js';
import Payment from '../models/Payment.js';

// Login admin
export const loginAdmin = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error('[Admin Login] Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email, password } = req.body;

    if (!email || !password) {
      console.error('[Admin Login] Missing email or password');
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Normalize email (lowercase and trim)
    const normalizedEmail = email.toLowerCase().trim();

    console.log('[Admin Login] Attempting login for:', normalizedEmail);

    // Find admin user - try both normalized and original email
    let admin = await User.findOne({ email: normalizedEmail, role: 'admin' });
    if (!admin) {
      admin = await User.findOne({ email: email.trim(), role: 'admin' });
    }
    
    if (!admin) {
      console.error('[Admin Login] Admin not found:', normalizedEmail);
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if admin is active
    if (!admin.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been disabled. Please contact administrator.'
      });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, admin.password);
    if (!isPasswordValid) {
      console.error('[Admin Login] Invalid password for:', normalizedEmail);
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check JWT_SECRET
    if (!process.env.JWT_SECRET) {
      console.error('[Admin Login] JWT_SECRET is not set');
      return res.status(500).json({
        success: false,
        message: 'Server configuration error'
      });
    }

    // Generate token
    const token = generateToken(admin._id);
    if (!token) {
      console.error('[Admin Login] Failed to generate token');
      return res.status(500).json({
        success: false,
        message: 'Failed to generate authentication token'
      });
    }

    console.log('[Admin Login] Login successful for:', normalizedEmail);

    // Set cookie with role-based name
    // For production cross-origin (Digital Ocean -> Digital Ocean), use 'none' with secure
    // For development same-origin, use 'lax'
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieOptions = {
      httpOnly: true,
      secure: isProduction, // Required for sameSite: 'none' (iOS requirement)
      sameSite: isProduction ? 'none' : 'lax', // 'none' for cross-origin, 'lax' for same-origin
      path: '/', // Make cookie available for all routes
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    };
    
    // CRITICAL FOR iOS: Set domain for cross-origin cookies in production
    // iOS Safari requires domain to be set for cross-subdomain cookies
    if (isProduction && req.headers.origin) {
      try {
        const originUrl = new URL(req.headers.origin);
        // Check if origin is from custom domain (itwos.store)
        if (originUrl.hostname.endsWith('.itwos.store') || originUrl.hostname === 'itwos.store') {
          cookieOptions.domain = '.itwos.store'; // Set cookie for all subdomains
          console.log('[Cookie] Setting domain for custom domain:', cookieOptions.domain);
        } else if (originUrl.hostname.endsWith('.ondigitalocean.app')) {
          // Fallback for Digital Ocean domains (during migration)
          const parts = originUrl.hostname.split('.');
          if (parts.length >= 2) {
            cookieOptions.domain = `.${parts.slice(-2).join('.')}`; // .ondigitalocean.app
            console.log('[Cookie] Setting domain for cross-origin:', cookieOptions.domain);
          }
        }
      } catch (e) {
        console.warn('[Cookie] Could not parse origin for domain setting:', e.message);
      }
    }
    
    res.cookie('adminToken', token, cookieOptions);
    
    // Enhanced logging for iOS debugging
    console.log('[Admin Login] Cookie set with options:', {
      httpOnly: cookieOptions.httpOnly,
      secure: cookieOptions.secure,
      sameSite: cookieOptions.sameSite,
      path: cookieOptions.path,
      domain: cookieOptions.domain || 'not set (same-origin)',
      isProduction,
      tokenLength: token.length,
    });
    
    // Set response headers for debugging
    res.setHeader('X-Cookie-Set', 'true');
    res.setHeader('X-Cookie-SameSite', cookieOptions.sameSite);
    res.setHeader('X-Cookie-Secure', cookieOptions.secure.toString());
    res.setHeader('X-Cookie-Domain', cookieOptions.domain || 'not-set');

    const adminResponse = await User.findById(admin._id).select('-password');

    res.status(200).json({
      success: true,
      message: 'Admin login successful',
      data: {
        id: adminResponse._id,
        name: adminResponse.name,
        email: adminResponse.email,
        role: adminResponse.role,
        countryCode: adminResponse.countryCode,
        phoneNumber: adminResponse.phoneNumber,
        fullNumber: adminResponse.fullNumber,
        isActive: adminResponse.isActive,
        profileImage: adminResponse.profileImage || null,
        createdAt: adminResponse.createdAt,
        updatedAt: adminResponse.updatedAt
      }
    });
  } catch (error) {
    console.error('[Admin Login] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred during login'
    });
  }
};

// Get current admin
export const getCurrentAdmin = async (req, res) => {
  try {
    const admin = await User.findById(req.user._id).select('-password');
    
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    // Get additional stats for admin
    const [
      totalUsersManaged,
      totalProjectsManaged,
      totalBookingsManaged,
      totalClientProjectsManaged
    ] = await Promise.all([
      User.countDocuments({ role: { $ne: 'admin' } }),
      Project.countDocuments(),
      DemoBooking.countDocuments(),
      ClientProject.countDocuments()
    ]);

    res.status(200).json({
      success: true,
      data: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        countryCode: admin.countryCode,
        phoneNumber: admin.phoneNumber,
        fullNumber: admin.fullNumber,
        isActive: admin.isActive,
        profileImage: admin.profileImage || null,
        createdAt: admin.createdAt,
        updatedAt: admin.updatedAt,
        stats: {
          totalUsersManaged,
          totalProjectsManaged,
          totalBookingsManaged,
          totalClientProjectsManaged
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get admin',
      error: error.message
    });
  }
};

// Logout admin
export const logoutAdmin = async (req, res) => {
  try {
    const isProduction = process.env.NODE_ENV === 'production';
    
    // CRITICAL: iOS requires EXACT same options when clearing as when setting
    // Must include domain if it was set during login
    const clearCookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      path: '/',
    };
    
    // Set domain for cross-origin cookies in production (iOS requirement)
    // Must match the domain used when setting the cookie
    if (isProduction && req.headers.origin) {
      try {
        const originUrl = new URL(req.headers.origin);
        // Check if origin is from custom domain (itwos.store)
        if (originUrl.hostname.endsWith('.itwos.store') || originUrl.hostname === 'itwos.store') {
          clearCookieOptions.domain = '.itwos.store';
        } else if (originUrl.hostname.endsWith('.ondigitalocean.app')) {
          // Fallback for Digital Ocean domains (during migration)
          const parts = originUrl.hostname.split('.');
          if (parts.length >= 2) {
            clearCookieOptions.domain = `.${parts.slice(-2).join('.')}`; // .ondigitalocean.app
          }
        }
      } catch (e) {
        console.warn('[Cookie Clear] Could not parse origin for domain setting:', e.message);
      }
    }
    
    res.clearCookie('adminToken', clearCookieOptions);
    
    console.log('[Admin Logout] Cookie cleared with options:', {
      httpOnly: clearCookieOptions.httpOnly,
      secure: clearCookieOptions.secure,
      sameSite: clearCookieOptions.sameSite,
      path: clearCookieOptions.path,
      domain: clearCookieOptions.domain || 'not set',
      isProduction,
    });
    
    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Logout failed',
      error: error.message
    });
  }
};

// Update admin profile
export const updateAdminProfile = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { name, email, password } = req.body;
    const adminId = req.user._id;

    const admin = await User.findById(adminId);
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    // Check if email is being changed and if it's already taken
    // Normalize emails to lowercase for comparison
    const normalizedEmail = email ? email.trim().toLowerCase() : null;
    const currentEmail = admin.email ? admin.email.trim().toLowerCase() : null;
    
    if (normalizedEmail && normalizedEmail !== currentEmail) {
      // Check if email exists, excluding the current admin
      const existingUser = await User.findOne({ 
        email: normalizedEmail,
        _id: { $ne: adminId }
      });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email already in use'
        });
      }
      admin.email = normalizedEmail;
    }

    if (name) admin.name = name;

    // Handle profile image upload
    if (req.file) {
      try {
        const fs = await import('fs');
        const result = await cloudinary.uploader.upload(req.file.path, {
          folder: 'chat-app/admin',
        });
        admin.profileImage = result.secure_url;
        // Delete temporary file
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
      } catch (uploadError) {
        return res.status(500).json({
          success: false,
          message: 'Failed to upload image',
          error: uploadError.message
        });
      }
    }

    // Update password if provided
    if (password) {
      admin.password = await bcrypt.hash(password, 10);
    }

    await admin.save();

    const adminResponse = await User.findById(adminId).select('-password');

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        id: adminResponse._id,
        name: adminResponse.name,
        email: adminResponse.email,
        role: adminResponse.role,
        countryCode: adminResponse.countryCode,
        phoneNumber: adminResponse.phoneNumber,
        fullNumber: adminResponse.fullNumber,
        isActive: adminResponse.isActive,
        profileImage: adminResponse.profileImage || null,
        createdAt: adminResponse.createdAt,
        updatedAt: adminResponse.updatedAt
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update profile',
      error: error.message
    });
  }
};

// Get admin dashboard stats - Optimized with aggregation
export const getAdminStats = async (req, res) => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Get all stats in parallel for better performance - using lean() and optimized queries
    const [
      // Users
      totalUsers,
      activeUsers,
      usersWithLocation,
      usersWithSubscriptions,
      recentUsers,
      usersLast30Days,
      
      // Projects
      totalProjects,
      activeProjects,
      recentProjects,
      
      // Teams
      totalTeams,
      activeTeams,
      
      // Bookings
      totalBookings,
      confirmedBookings,
      pendingBookings,
      recentBookings,
      
      // Client Projects
      totalClientProjects,
      activeClientProjects,
      
      // Meetings
      totalMeetings,
      pendingMeetings,
      scheduledMeetings,
      
      // Social - Chats & Messages
      totalChats,
      totalMessages,
      unreadMessages,
      
      // Friendships
      totalFriendships,
      
      // Posts
      totalPosts,
      archivedPosts,
      postsWithImages,
      postsWithSongs,
      totalLikes,
      totalComments,
      recentPosts,
      
      // Stories
      totalStories,
      activeStories,
      expiredStories,
      totalStoryViews,
      totalStoryLikes,
      totalStoryReplies,
      recentStories,
      
      // Subscriptions
      totalSubscriptions,
      activeSubscriptions,
      expiredSubscriptions,
      subscriptionsByBadge,
      totalRevenue,
      monthlyRevenue,
      
      // Banners
      totalBanners,
      activeBanners,
      totalBannerPurchases,
      bannersByRarity,
      
      // Notifications
      totalNotifications,
      unreadNotifications,
      notificationsByType,
      
      // Payments
      totalPayments,
      successfulPayments,
      pendingPayments,
      totalPaymentAmount
    ] = await Promise.all([
      // Users - countDocuments returns a number directly
      User.countDocuments({ role: { $ne: 'admin' } }),
      User.countDocuments({ role: { $ne: 'admin' }, isActive: true }),
      User.countDocuments({ 
        role: { $ne: 'admin' },
        'address.country': { $exists: true, $ne: '' }
      }),
      User.countDocuments({ 
        role: { $ne: 'admin' },
        'subscription.badgeType': { $exists: true, $ne: null }
      }),
      User.countDocuments({
        role: { $ne: 'admin' },
        createdAt: { $gte: sevenDaysAgo }
      }),
      User.countDocuments({
        role: { $ne: 'admin' },
        createdAt: { $gte: thirtyDaysAgo }
      }),
      
      // Projects
      Project.countDocuments(),
      Project.countDocuments({ isActive: true }),
      Project.countDocuments({
        createdAt: { $gte: sevenDaysAgo }
      }),
      
      // Teams
      Team.countDocuments(),
      Team.countDocuments({ isActive: true }),
      
      // Bookings
      DemoBooking.countDocuments(),
      DemoBooking.countDocuments({ status: 'confirmed' }),
      DemoBooking.countDocuments({ status: 'pending' }),
      DemoBooking.countDocuments({
        createdAt: { $gte: sevenDaysAgo }
      }),
      
      // Client Projects
      ClientProject.countDocuments(),
      ClientProject.countDocuments({ isActive: true }),
      
      // Meetings
      Meeting.countDocuments(),
      Meeting.countDocuments({ status: 'pending' }),
      Meeting.countDocuments({ status: 'scheduled' }),
      
      // Chats & Messages
      Chat.countDocuments({ isActive: true }),
      Message.countDocuments({ isDeleted: false }),
      Message.countDocuments({ isDeleted: false, isRead: false }),
      
      // Friendships
      FriendRequest.countDocuments({ status: 'accepted' }),
      
      // Posts
      Post.countDocuments(),
      Post.countDocuments({ isArchived: true }),
      Post.countDocuments({ images: { $exists: true, $ne: [] } }),
      Post.countDocuments({ song: { $exists: true, $ne: null } }),
      Post.aggregate([
        { $project: { likesCount: { $size: { $ifNull: ['$likes', []] } } } },
        { $group: { _id: null, total: { $sum: '$likesCount' } } }
      ]).then(result => result[0]?.total || 0),
      Post.aggregate([
        { $project: { commentsCount: { $size: { $ifNull: ['$comments', []] } } } },
        { $group: { _id: null, total: { $sum: '$commentsCount' } } }
      ]).then(result => result[0]?.total || 0),
      Post.countDocuments({
        createdAt: { $gte: sevenDaysAgo }
      }),
      
      // Stories
      Story.countDocuments(),
      Story.countDocuments({ expiresAt: { $gt: new Date() } }),
      Story.countDocuments({ expiresAt: { $lte: new Date() } }),
      Story.aggregate([
        { $group: { _id: null, total: { $sum: '$viewCount' } } }
      ]).then(result => result[0]?.total || 0),
      Story.aggregate([
        { $group: { _id: null, total: { $sum: '$likeCount' } } }
      ]).then(result => result[0]?.total || 0),
      Story.aggregate([
        { $group: { _id: null, total: { $sum: '$replyCount' } } }
      ]).then(result => result[0]?.total || 0),
      Story.countDocuments({
        createdAt: { $gte: sevenDaysAgo }
      }),
      
      // Subscriptions - using aggregation
      Subscription.countDocuments(),
      Subscription.countDocuments({ status: 'active' }),
      Subscription.countDocuments({ status: 'expired' }),
      Subscription.aggregate([
        { $group: { _id: '$badgeType', count: { $sum: 1 } } }
      ]).then(result => {
        const badges = { blue: 0, yellow: 0, pink: 0 };
        result.forEach(item => {
          if (item._id) badges[item._id] = item.count;
        });
        return badges;
      }),
      Payment.aggregate([
        { $match: { paymentStatus: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]).then(result => result[0]?.total || 0),
      Payment.aggregate([
        { 
          $match: { 
            paymentStatus: 'completed',
            createdAt: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) }
          } 
        },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]).then(result => result[0]?.total || 0),
      
      // Banners
      Banner.countDocuments(),
      Banner.countDocuments({ isActive: true }),
      Banner.aggregate([
        { $group: { _id: null, total: { $sum: '$purchaseCount' } } }
      ]).then(result => result[0]?.total || 0),
      Banner.aggregate([
        { $group: { _id: '$rarity', count: { $sum: 1 } } }
      ]).then(result => {
        const rarities = {};
        result.forEach(item => {
          rarities[item._id] = item.count;
        });
        return rarities;
      }),
      
      // Notifications
      Notification.countDocuments(),
      Notification.countDocuments({ isRead: false }),
      Notification.aggregate([
        { $group: { _id: '$type', count: { $sum: 1 } } }
      ]).then(result => {
        const types = {};
        result.forEach(item => {
          types[item._id] = item.count;
        });
        return types;
      }),
      
      // Payments
      Payment.countDocuments(),
      Payment.countDocuments({ paymentStatus: 'completed' }),
      Payment.countDocuments({ paymentStatus: 'pending' }),
      Payment.aggregate([
        { $match: { paymentStatus: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]).then(result => result[0]?.total || 0)
    ]);

    // Calculate friends count (mutual follows create 2 records)
    const friendsCount = Math.floor(totalFriendships / 2);

    res.status(200).json({
      success: true,
      data: {
        users: {
          total: totalUsers,
          active: activeUsers,
          inactive: totalUsers - activeUsers,
          withLocation: usersWithLocation,
          withSubscriptions: usersWithSubscriptions,
          recent: recentUsers,
          last30Days: usersLast30Days
        },
        projects: {
          total: totalProjects,
          active: activeProjects,
          inactive: totalProjects - activeProjects,
          recent: recentProjects
        },
        teams: {
          total: totalTeams,
          active: activeTeams,
          inactive: totalTeams - activeTeams
        },
        bookings: {
          total: totalBookings,
          confirmed: confirmedBookings,
          pending: pendingBookings,
          recent: recentBookings
        },
        clientProjects: {
          total: totalClientProjects,
          active: activeClientProjects,
          inactive: totalClientProjects - activeClientProjects
        },
        meetings: {
          total: totalMeetings,
          pending: pendingMeetings,
          scheduled: scheduledMeetings
        },
        social: {
          totalChats: totalChats,
          totalMessages: totalMessages,
          unreadMessages: unreadMessages,
          totalFriends: friendsCount
        },
        posts: {
          total: totalPosts,
          archived: archivedPosts,
          active: totalPosts - archivedPosts,
          withImages: postsWithImages,
          withSongs: postsWithSongs,
          totalLikes: totalLikes,
          totalComments: totalComments,
          recent: recentPosts
        },
        stories: {
          total: totalStories,
          active: activeStories,
          expired: expiredStories,
          totalViews: totalStoryViews,
          totalLikes: totalStoryLikes,
          totalReplies: totalStoryReplies,
          recent: recentStories
        },
        subscriptions: {
          total: totalSubscriptions,
          active: activeSubscriptions,
          expired: expiredSubscriptions,
          byBadge: subscriptionsByBadge,
          totalRevenue: totalRevenue,
          monthlyRevenue: monthlyRevenue
        },
        banners: {
          total: totalBanners,
          active: activeBanners,
          totalPurchases: totalBannerPurchases,
          byRarity: bannersByRarity
        },
        notifications: {
          total: totalNotifications,
          unread: unreadNotifications,
          read: totalNotifications - unreadNotifications,
          byType: notificationsByType
        },
        payments: {
          total: totalPayments,
          successful: successfulPayments,
          pending: pendingPayments,
          totalAmount: totalPaymentAmount
        }
      }
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard stats',
      error: error.message
    });
  }
};

