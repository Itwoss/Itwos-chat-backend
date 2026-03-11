import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export const authenticateSocket = async (socket) => {
  try {
    // Get token from handshake auth or cookies
    let token = socket.handshake.auth?.token;
    
    // If no token in auth, try to get from cookies
    if (!token && socket.handshake.headers?.cookie) {
      const cookies = socket.handshake.headers.cookie;
      const userTokenMatch = cookies.match(/userToken=([^;]+)/);
      const adminTokenMatch = cookies.match(/adminToken=([^;]+)/);
      token = userTokenMatch ? userTokenMatch[1] : (adminTokenMatch ? adminTokenMatch[1] : null);
    }

    if (!token) {
      return null;
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user
    const user = await User.findById(decoded.id);
    if (!user || !user.isActive) {
      return null;
    }

    return user._id.toString();
  } catch (error) {
    console.error('Socket authentication error:', error);
    return null;
  }
};

