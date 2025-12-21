import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { validationResult } from 'express-validator';

// Get all users (for admin)
export const getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', role = '', isActive = '' } = req.query;
    
    // Build query - exclude admins from user list
    const query = { role: { $ne: 'admin' } };
    
    if (role) {
      query.role = role;
    }
    
    if (isActive !== '') {
      query.isActive = isActive === 'true';
    }
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await User.countDocuments(query);

    res.status(200).json({
      success: true,
      data: users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: error.message
    });
  }
};

// Get single user by ID
export const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user',
      error: error.message
    });
  }
};

// Create user (admin only)
export const createUser = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { name, email, password, countryCode, phoneNumber, role = 'user' } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Validate phone number
    if (!/^\d{6,15}$/.test(phoneNumber)) {
      return res.status(400).json({
        success: false,
        message: 'Phone number must be 6-15 digits'
      });
    }

    // Create full number without +
    const fullNumber = countryCode + phoneNumber;

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      countryCode,
      phoneNumber,
      fullNumber,
      role,
      isActive: true
    });

    const userResponse = await User.findById(user._id).select('-password');

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: userResponse
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create user',
      error: error.message
    });
  }
};

// Update user
export const updateUser = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { name, email, countryCode, phoneNumber, role, isActive, password } = req.body;
    const userId = req.params.id;

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if email is being changed and if it's already taken
    // Normalize emails to lowercase for comparison
    const normalizedEmail = email ? email.trim().toLowerCase() : null;
    const currentEmail = user.email ? user.email.trim().toLowerCase() : null;
    
    if (normalizedEmail && normalizedEmail !== currentEmail) {
      // Check if email exists, excluding the current user
      const existingUser = await User.findOne({ 
        email: normalizedEmail,
        _id: { $ne: userId }
      });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email already in use'
        });
      }
    }

    // Update fields
    if (name) user.name = name;
    if (normalizedEmail) user.email = normalizedEmail;
    if (role) user.role = role;
    if (typeof isActive === 'boolean') user.isActive = isActive;
    
    if (countryCode && phoneNumber) {
      if (!/^\d{6,15}$/.test(phoneNumber)) {
        return res.status(400).json({
          success: false,
          message: 'Phone number must be 6-15 digits'
        });
      }
      user.countryCode = countryCode;
      user.phoneNumber = phoneNumber;
      user.fullNumber = countryCode + phoneNumber;
    }

    // Update password if provided
    if (password) {
      user.password = await bcrypt.hash(password, 10);
    }

    await user.save();

    const userResponse = await User.findById(userId).select('-password');

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: userResponse
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update user',
      error: error.message
    });
  }
};

// Delete user
export const deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prevent deleting admin users
    if (user.role === 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Cannot delete admin users'
      });
    }

    await User.findByIdAndDelete(userId);

    res.status(200).json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete user',
      error: error.message
    });
  }
};

// Toggle user active status
export const toggleUserStatus = async (req, res) => {
  try {
    const userId = req.params.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prevent disabling admin users
    if (user.role === 'admin' && !user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Cannot disable admin users'
      });
    }

    user.isActive = !user.isActive;
    await user.save();

    const userResponse = await User.findById(userId).select('-password');

    res.status(200).json({
      success: true,
      message: `User ${user.isActive ? 'enabled' : 'disabled'} successfully`,
      data: userResponse
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to toggle user status',
      error: error.message
    });
  }
};

