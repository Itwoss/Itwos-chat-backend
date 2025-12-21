import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export const authenticate = async (req, res, next) => {
  try {
    // For admin routes, prioritize adminToken; for user routes, prioritize userToken
    const isAdminRoute = req.path.startsWith('/admin');
    let token = null;
    
    // Debug: Log all cookies received
    console.log('[Authenticate] All cookies:', req.cookies);
    console.log('[Authenticate] Request path:', req.path);
    console.log('[Authenticate] Is admin route:', isAdminRoute);
    
    if (isAdminRoute) {
      // Admin routes: prefer adminToken, fallback to userToken (in case admin logged in as user)
      token = req.cookies.adminToken || req.cookies.userToken;
      console.log('[Authenticate] Admin route - adminToken:', !!req.cookies.adminToken, 'userToken:', !!req.cookies.userToken);
    } else {
      // User routes: prefer userToken, fallback to adminToken (in case user logged in as admin)
      token = req.cookies.userToken || req.cookies.adminToken;
      console.log('[Authenticate] User route - userToken:', !!req.cookies.userToken, 'adminToken:', !!req.cookies.adminToken);
    }
    
    // If not in cookies, try Authorization header
    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
        console.log('[Authenticate] Using Authorization header token');
      }
    }

    if (!token) {
      console.error('[Authenticate] No token found. Cookies:', Object.keys(req.cookies || {}));
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required. Please login.' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      console.error('[Authenticate] User not found for ID:', decoded.id);
      return res.status(401).json({ 
        success: false, 
        message: 'User not found. Please login again.' 
      });
    }

    console.log('[Authenticate] User authenticated:', user.email, 'Role:', user.role, 'Route:', req.path);
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false, 
        message: 'Session expired. Please login again.' 
      });
    }
    res.status(500).json({ 
      success: false, 
      message: 'Authentication error', 
      error: error.message 
    });
  }
};

export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      console.error('[Authorize] No user found in request');
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required' 
      });
    }

    console.log('[Authorize] User role:', req.user.role, 'Required roles:', roles);
    
    if (!roles.includes(req.user.role)) {
      console.error('[Authorize] Access denied. User role:', req.user.role, 'Required:', roles);
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. Insufficient permissions.' 
      });
    }

    next();
  };
};

