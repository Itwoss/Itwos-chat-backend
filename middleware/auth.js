import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export const authenticate = async (req, res, next) => {
  try {
    // For admin routes, prioritize adminToken; for user routes, prioritize userToken
    const isAdminRoute = req.path.startsWith('/admin');
    let token = null;
    
    const allCookies = req.cookies || {};
    const cookieKeys = Object.keys(allCookies);
    const cookieHeader = req.headers.cookie || 'No cookie header';
    const verboseAuthLog = process.env.AUTH_VERBOSE_LOG === 'true';

    if (verboseAuthLog) {
      console.log('[Authenticate] Request details:', {
        path: req.path,
        method: req.method,
        origin: req.headers.origin,
        'cookie-header': cookieHeader.substring(0, 100),
        'parsed-cookies': cookieKeys,
        'has-userToken': !!allCookies.userToken,
        'has-adminToken': !!allCookies.adminToken,
        'is-admin-route': isAdminRoute,
      });
    }

    if (isAdminRoute) {
      token = allCookies.adminToken || allCookies.userToken;
      if (verboseAuthLog) console.log('[Authenticate] Admin route - adminToken:', !!allCookies.adminToken, 'userToken:', !!allCookies.userToken);
    } else {
      token = allCookies.userToken || allCookies.adminToken;
      if (verboseAuthLog) console.log('[Authenticate] User route - userToken:', !!allCookies.userToken, 'adminToken:', !!allCookies.adminToken);
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
      // Enhanced error message for debugging
      console.error('[Authenticate] No token found:', {
        cookiesReceived: cookieKeys.length,
        cookieHeaderPresent: cookieHeader !== 'No cookie header',
        cookieHeaderLength: cookieHeader.length,
        origin: req.headers.origin,
        referer: req.headers.referer,
        'user-agent': req.headers['user-agent']?.substring(0, 50),
      });
      
      // Return helpful error message
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required. Please login.',
        debug: process.env.NODE_ENV === 'development' ? {
          cookiesReceived: cookieKeys,
          cookieHeaderPresent: cookieHeader !== 'No cookie header',
          origin: req.headers.origin,
        } : undefined,
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

    if (process.env.AUTH_VERBOSE_LOG === 'true') console.log('[Authorize] User role:', req.user.role, 'Required roles:', roles);

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

