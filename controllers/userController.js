import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { generateToken } from '../utils/generateToken.js';
import { validationResult } from 'express-validator';

// Country codes validation
const COUNTRY_CODES = [
  { code: '1', country: 'US/CA' },
  { code: '44', country: 'UK' },
  { code: '91', country: 'India' },
  { code: '86', country: 'China' },
  { code: '81', country: 'Japan' },
  { code: '49', country: 'Germany' },
  { code: '33', country: 'France' },
  { code: '39', country: 'Italy' },
  { code: '34', country: 'Spain' },
  { code: '61', country: 'Australia' },
  { code: '55', country: 'Brazil' },
  { code: '7', country: 'Russia' },
  { code: '82', country: 'South Korea' },
  { code: '31', country: 'Netherlands' },
  { code: '46', country: 'Sweden' },
  { code: '47', country: 'Norway' },
  { code: '45', country: 'Denmark' },
  { code: '358', country: 'Finland' },
  { code: '41', country: 'Switzerland' },
  { code: '43', country: 'Austria' },
  { code: '32', country: 'Belgium' },
  { code: '351', country: 'Portugal' },
  { code: '353', country: 'Ireland' },
  { code: '48', country: 'Poland' },
  { code: '420', country: 'Czech Republic' },
  { code: '36', country: 'Hungary' },
  { code: '40', country: 'Romania' },
  { code: '30', country: 'Greece' },
  { code: '90', country: 'Turkey' },
  { code: '971', country: 'UAE' },
  { code: '966', country: 'Saudi Arabia' },
  { code: '27', country: 'South Africa' },
  { code: '52', country: 'Mexico' },
  { code: '54', country: 'Argentina' },
  { code: '56', country: 'Chile' },
  { code: '57', country: 'Colombia' },
  { code: '51', country: 'Peru' },
  { code: '65', country: 'Singapore' },
  { code: '60', country: 'Malaysia' },
  { code: '66', country: 'Thailand' },
  { code: '62', country: 'Indonesia' },
  { code: '63', country: 'Philippines' },
  { code: '84', country: 'Vietnam' },
  { code: '64', country: 'New Zealand' },
  { code: '20', country: 'Egypt' },
  { code: '234', country: 'Nigeria' },
  { code: '254', country: 'Kenya' },
  { code: '92', country: 'Pakistan' },
  { code: '880', country: 'Bangladesh' },
  { code: '94', country: 'Sri Lanka' },
  { code: '977', country: 'Nepal' },
  { code: '95', country: 'Myanmar' },
  { code: '855', country: 'Cambodia' },
  { code: '856', country: 'Laos' },
  { code: '673', country: 'Brunei' },
  { code: '670', country: 'East Timor' },
  { code: '212', country: 'Morocco' },
  { code: '213', country: 'Algeria' },
  { code: '216', country: 'Tunisia' },
  { code: '218', country: 'Libya' },
  { code: '249', country: 'Sudan' },
  { code: '251', country: 'Ethiopia' },
  { code: '255', country: 'Tanzania' },
  { code: '256', country: 'Uganda' },
  { code: '250', country: 'Rwanda' },
  { code: '257', country: 'Burundi' },
  { code: '260', country: 'Zambia' },
  { code: '263', country: 'Zimbabwe' },
  { code: '264', country: 'Namibia' },
  { code: '267', country: 'Botswana' },
  { code: '268', country: 'Swaziland' },
  { code: '269', country: 'Comoros' },
  { code: '290', country: 'Saint Helena' },
  { code: '291', country: 'Eritrea' },
  { code: '297', country: 'Aruba' },
  { code: '298', country: 'Faroe Islands' },
  { code: '299', country: 'Greenland' },
  { code: '350', country: 'Gibraltar' },
  { code: '352', country: 'Luxembourg' },
  { code: '354', country: 'Iceland' },
  { code: '356', country: 'Malta' },
  { code: '357', country: 'Cyprus' },
  { code: '370', country: 'Lithuania' },
  { code: '371', country: 'Latvia' },
  { code: '372', country: 'Estonia' },
  { code: '373', country: 'Moldova' },
  { code: '374', country: 'Armenia' },
  { code: '375', country: 'Belarus' },
  { code: '376', country: 'Andorra' },
  { code: '377', country: 'Monaco' },
  { code: '378', country: 'San Marino' },
  { code: '380', country: 'Ukraine' },
  { code: '381', country: 'Serbia' },
  { code: '382', country: 'Montenegro' },
  { code: '383', country: 'Kosovo' },
  { code: '385', country: 'Croatia' },
  { code: '386', country: 'Slovenia' },
  { code: '387', country: 'Bosnia and Herzegovina' },
  { code: '389', country: 'North Macedonia' },
  { code: '421', country: 'Slovakia' },
  { code: '423', country: 'Liechtenstein' },
  { code: '500', country: 'Falkland Islands' },
  { code: '501', country: 'Belize' },
  { code: '502', country: 'Guatemala' },
  { code: '503', country: 'El Salvador' },
  { code: '504', country: 'Honduras' },
  { code: '505', country: 'Nicaragua' },
  { code: '506', country: 'Costa Rica' },
  { code: '507', country: 'Panama' },
  { code: '508', country: 'Saint Pierre and Miquelon' },
  { code: '509', country: 'Haiti' },
  { code: '590', country: 'Guadeloupe' },
  { code: '591', country: 'Bolivia' },
  { code: '592', country: 'Guyana' },
  { code: '593', country: 'Ecuador' },
  { code: '594', country: 'French Guiana' },
  { code: '595', country: 'Paraguay' },
  { code: '596', country: 'Martinique' },
  { code: '597', country: 'Suriname' },
  { code: '598', country: 'Uruguay' },
  { code: '599', country: 'Netherlands Antilles' },
  { code: '670', country: 'East Timor' },
  { code: '672', country: 'Antarctica' },
  { code: '673', country: 'Brunei' },
  { code: '674', country: 'Nauru' },
  { code: '675', country: 'Papua New Guinea' },
  { code: '676', country: 'Tonga' },
  { code: '677', country: 'Solomon Islands' },
  { code: '678', country: 'Vanuatu' },
  { code: '679', country: 'Fiji' },
  { code: '680', country: 'Palau' },
  { code: '681', country: 'Wallis and Futuna' },
  { code: '682', country: 'Cook Islands' },
  { code: '683', country: 'Niue' },
  { code: '684', country: 'American Samoa' },
  { code: '685', country: 'Samoa' },
  { code: '686', country: 'Kiribati' },
  { code: '687', country: 'New Caledonia' },
  { code: '688', country: 'Tuvalu' },
  { code: '689', country: 'French Polynesia' },
  { code: '690', country: 'Tokelau' },
  { code: '691', country: 'Micronesia' },
  { code: '692', country: 'Marshall Islands' },
  { code: '850', country: 'North Korea' },
  { code: '852', country: 'Hong Kong' },
  { code: '853', country: 'Macau' },
  { code: '855', country: 'Cambodia' },
  { code: '856', country: 'Laos' },
  { code: '880', country: 'Bangladesh' },
  { code: '886', country: 'Taiwan' },
  { code: '960', country: 'Maldives' },
  { code: '961', country: 'Lebanon' },
  { code: '962', country: 'Jordan' },
  { code: '963', country: 'Syria' },
  { code: '964', country: 'Iraq' },
  { code: '965', country: 'Kuwait' },
  { code: '966', country: 'Saudi Arabia' },
  { code: '967', country: 'Yemen' },
  { code: '968', country: 'Oman' },
  { code: '970', country: 'Palestine' },
  { code: '971', country: 'UAE' },
  { code: '972', country: 'Israel' },
  { code: '973', country: 'Bahrain' },
  { code: '974', country: 'Qatar' },
  { code: '975', country: 'Bhutan' },
  { code: '976', country: 'Mongolia' },
  { code: '977', country: 'Nepal' },
  { code: '992', country: 'Tajikistan' },
  { code: '993', country: 'Turkmenistan' },
  { code: '994', country: 'Azerbaijan' },
  { code: '995', country: 'Georgia' },
  { code: '996', country: 'Kyrgyzstan' },
  { code: '998', country: 'Uzbekistan' }
];

const isValidCountryCode = (code) => {
  return COUNTRY_CODES.some(country => country.code === code);
};

// Register user
export const registerUser = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { name, email, password, countryCode, phoneNumber } = req.body;

    // Validate country code
    if (!isValidCountryCode(countryCode)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid country code'
      });
    }

    // Validate phone number (should be numeric and reasonable length)
    if (!/^\d{6,15}$/.test(phoneNumber)) {
      return res.status(400).json({
        success: false,
        message: 'Phone number must be 6-15 digits'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
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
      role: 'user'
    });

    // Generate token
    const token = generateToken(user._id);

    // Set cookie with role-based name
    // Use 'lax' for same-site requests, works with localhost and IP if same origin
    res.cookie('userToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', // Works for same-site and top-level navigations
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      // Don't set domain to allow both localhost and IP addresses
    });

    const userResponse = await User.findById(user._id).select('-password');

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        id: userResponse._id,
        name: userResponse.name,
        email: userResponse.email,
        role: userResponse.role,
        countryCode: userResponse.countryCode,
        phoneNumber: userResponse.phoneNumber,
        fullNumber: userResponse.fullNumber,
        isActive: userResponse.isActive,
        profileImage: userResponse.profileImage || null,
        accountType: userResponse.accountType || 'public',
        onlineStatus: userResponse.onlineStatus || 'offline',
        lastSeen: userResponse.lastSeen,
        createdAt: userResponse.createdAt,
        updatedAt: userResponse.updatedAt
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Registration failed',
      error: error.message
    });
  }
};

// Login user
export const loginUser = async (req, res) => {
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

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been disabled. Please contact administrator.'
      });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if JWT_SECRET is configured
    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET is not configured in environment variables');
      return res.status(500).json({
        success: false,
        message: 'Server configuration error. Please contact administrator.'
      });
    }

    // Generate token
    const token = generateToken(user._id);

    // Set cookie with role-based name
    // Use 'lax' for same-site requests, works with localhost and IP if same origin
    res.cookie('userToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', // Works for same-site and top-level navigations
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      // Don't set domain to allow both localhost and IP addresses
    });

    const userResponse = await User.findById(user._id).select('-password').lean();

    if (!userResponse) {
      return res.status(500).json({
        success: false,
        message: 'Error retrieving user data'
      });
    }

    // Safely handle subscription field
    const subscription = userResponse.subscription || {};
    const subscriptionData = {
      badgeType: subscription.badgeType || null,
      subscriptionId: subscription.subscriptionId || null
    };

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        id: userResponse._id,
        name: userResponse.name,
        email: userResponse.email,
        role: userResponse.role,
        countryCode: userResponse.countryCode,
        phoneNumber: userResponse.phoneNumber,
        fullNumber: userResponse.fullNumber,
        isActive: userResponse.isActive,
        profileImage: userResponse.profileImage || null,
        accountType: userResponse.accountType || 'public',
        onlineStatus: userResponse.onlineStatus || 'offline',
        lastSeen: userResponse.lastSeen,
        subscription: subscriptionData,
        createdAt: userResponse.createdAt,
        updatedAt: userResponse.updatedAt
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred during login'
    });
  }
};

// Get current user
export const getCurrentUser = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      console.error('[User Controller] No user in request');
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const user = await User.findById(req.user._id).select('-password');
    
    if (!user) {
      console.error('[User Controller] User not found:', req.user._id);
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get user stats
    const [
      totalPosts,
      totalFriends,
      totalBookings,
      totalClientProjects
    ] = await Promise.all([
      (await import('../models/Post.js')).default.countDocuments({ author: user._id }),
      (await import('../models/FriendRequest.js')).default.countDocuments({
        $or: [
          { fromUser: user._id, status: 'accepted' },
          { toUser: user._id, status: 'accepted' }
        ]
      }).then(count => Math.floor(count / 2)), // Divide by 2 for unique friendships
      (await import('../models/DemoBooking.js')).default.countDocuments({ user: user._id }),
      (await import('../models/ClientProject.js')).default.countDocuments({ client: user._id })
    ]);

    // Safely handle subscription field
    const subscription = user.subscription || {};
    const subscriptionData = {
      badgeType: subscription.badgeType || null,
      subscriptionId: subscription.subscriptionId || null
    };

    res.status(200).json({
      success: true,
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        countryCode: user.countryCode,
        phoneNumber: user.phoneNumber,
        fullNumber: user.fullNumber,
        isActive: user.isActive,
        profileImage: user.profileImage || null,
        accountType: user.accountType || 'public',
        onlineStatus: user.onlineStatus || 'offline',
        lastSeen: user.lastSeen,
        privacySettings: user.privacySettings || {
          hideLastSeen: false,
          hideOnlineStatus: false
        },
        subscription: subscriptionData,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        stats: {
          totalPosts,
          totalFriends,
          totalBookings,
          totalClientProjects
        }
      }
    });
  } catch (error) {
    console.error('[User Controller] Error in getCurrentUser:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Logout user
export const logoutUser = async (req, res) => {
  try {
    res.clearCookie('userToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
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

// Update user profile
export const updateUserProfile = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { name, email, password, countryCode, phoneNumber, accountType, privacySettings } = req.body;
    const userId = req.user._id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if email is being changed and if it's already taken
    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email already in use'
        });
      }
      user.email = email;
    }

    if (name) user.name = name;

    // Update phone number if provided
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

    // Handle profile image upload
    if (req.file) {
      try {
        const cloudinary = (await import('../utils/cloudinary.js')).default;
        const fs = await import('fs');
        const result = await cloudinary.uploader.upload(req.file.path, {
          folder: 'chat-app/users',
        });
        user.profileImage = result.secure_url;
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
      user.password = await bcrypt.hash(password, 10);
    }

    // Update account type if provided
    if (accountType && (accountType === 'public' || accountType === 'private')) {
      user.accountType = accountType;
    }

    // Update privacy settings if provided
    if (privacySettings) {
      if (!user.privacySettings) {
        user.privacySettings = {};
      }
      if (typeof privacySettings.hideLastSeen === 'boolean') {
        user.privacySettings.hideLastSeen = privacySettings.hideLastSeen;
      }
      if (typeof privacySettings.hideOnlineStatus === 'boolean') {
        user.privacySettings.hideOnlineStatus = privacySettings.hideOnlineStatus;
      }
    }

    await user.save();

    const userResponse = await User.findById(userId).select('-password');

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        id: userResponse._id,
        name: userResponse.name,
        email: userResponse.email,
        role: userResponse.role,
        countryCode: userResponse.countryCode,
        phoneNumber: userResponse.phoneNumber,
        fullNumber: userResponse.fullNumber,
        isActive: userResponse.isActive,
        profileImage: userResponse.profileImage || null,
        accountType: userResponse.accountType || 'public',
        onlineStatus: userResponse.onlineStatus || 'offline',
        lastSeen: userResponse.lastSeen,
        privacySettings: userResponse.privacySettings || {
          hideLastSeen: false,
          hideOnlineStatus: false
        },
        createdAt: userResponse.createdAt,
        updatedAt: userResponse.updatedAt
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

