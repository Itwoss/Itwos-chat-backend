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

// Login admin
export const loginAdmin = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email, password } = req.body;

    // Find admin user
    const admin = await User.findOne({ email, role: 'admin' });
    if (!admin) {
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
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Generate token
    const token = generateToken(admin._id);

    // Set cookie with role-based name
    res.cookie('adminToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

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
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
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
    res.clearCookie('adminToken');
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
    if (email && email !== admin.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email already in use'
        });
      }
      admin.email = email;
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

// Get admin dashboard stats
export const getAdminStats = async (req, res) => {
  try {
    // Get all stats in parallel for better performance
    const [
      totalUsers,
      activeUsers,
      totalProjects,
      activeProjects,
      totalTeams,
      activeTeams,
      totalBookings,
      confirmedBookings,
      pendingBookings,
      totalClientProjects,
      activeClientProjects,
      totalMeetings,
      pendingMeetings,
      scheduledMeetings,
      totalChats,
      totalMessages,
      totalFriendships,
      recentUsers,
      recentBookings,
      recentProjects
    ] = await Promise.all([
      // Users
      User.countDocuments({ role: { $ne: 'admin' } }),
      User.countDocuments({ role: { $ne: 'admin' }, isActive: true }),
      
      // Projects
      Project.countDocuments(),
      Project.countDocuments({ isActive: true }),
      
      // Teams
      Team.countDocuments(),
      Team.countDocuments({ isActive: true }),
      
      // Bookings
      DemoBooking.countDocuments(),
      DemoBooking.countDocuments({ status: 'confirmed' }),
      DemoBooking.countDocuments({ status: 'pending' }),
      
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
      
      // Friendships
      FriendRequest.countDocuments({ status: 'accepted' }),
      
      // Recent activity (last 7 days)
      User.countDocuments({
        role: { $ne: 'admin' },
        createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      }),
      DemoBooking.countDocuments({
        createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      }),
      Project.countDocuments({
        createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      })
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
          recent: recentUsers
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
          totalFriends: friendsCount
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard stats',
      error: error.message
    });
  }
};

