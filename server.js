import './loadEnv.js'; // Load .env first so VAPID and other env are set before pushService etc. load
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import { Server } from 'socket.io';
import userRoutes from './routes/userRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import adminUserRoutes from './routes/adminUserRoutes.js';
import adminTeamRoutes from './routes/adminTeamRoutes.js';
import demoBookingRoutes from './routes/demoBookingRoutes.js';
import adminBookingRoutes from './routes/adminBookingRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import meetingRoutes from './routes/meetingRoutes.js';
import friendRequestRoutes from './routes/friendRequestRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import adminChatRoutes from './routes/adminChatRoutes.js';
import adminChatThemeRoutes from './routes/adminChatThemeRoutes.js';
import postRoutes from './routes/postRoutes.js';
import subscriptionRoutes from './routes/subscriptionRoutes.js';
import adminSubscriptionRoutes from './routes/adminSubscriptionRoutes.js';
import bannerRoutes from './routes/bannerRoutes.js';
import adminBannerRoutes from './routes/adminBannerRoutes.js';
import storyRoutes from './routes/storyRoutes.js';
import adminStoryRoutes from './routes/adminStoryRoutes.js';
import memoryRoutes from './routes/memoryRoutes.js';
import adminPostRoutes from './routes/adminPostRoutes.js';
import musicRoutes from './routes/musicRoutes.js';
import countRoutes from './routes/countRoutes.js';
import leaderboardRoutes from './routes/leaderboardRoutes.js';
import adminRuleRoutes from './routes/adminRuleRoutes.js';
import eventRoutes from './routes/eventRoutes.js';
import abuseRoutes from './routes/abuseRoutes.js';
import supportRoutes from './routes/supportRoutes.js';
import searchRoutes from './routes/searchRoutes.js';
import healthRoutes from './routes/healthRoutes.js';
import profileLikeRoutes from './routes/profileLikeRoutes.js';
import adminProfileLikeRoutes from './routes/adminProfileLikeRoutes.js';
import fontRoutes from './routes/fontRoutes.js';
import adminFontRoutes from './routes/adminFontRoutes.js';
import adminProfileReportRoutes from './routes/adminProfileReportRoutes.js';
import { authenticateSocket } from './middleware/socketAuth.js';
import { authenticate, authorize, optionalAuthenticate } from './middleware/auth.js';
import {
  postProfileLike,
  getProfileTotalLikes,
  getProfileLikeStatus,
  getProfileLikers,
} from './controllers/profileLikeController.js';
import { addPostToProfile } from './controllers/postController.js';
import { getOpenPostLandingHtml } from './controllers/openPostController.js';

const app = express();
const httpServer = createServer(app);
// CORS configuration - allow multiple origins (CRITICAL for cookies/auth)
const allowedOrigins = [
  'https://itwos.store',
  'https://www.itwos.store',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://192.0.0.2:5173',
  'https://app.itwos.store',
  // Capacitor native app (iOS uses capacitor://localhost; Android may use http(s)://localhost)
  'capacitor://localhost',
  'ionic://localhost',
  'http://localhost',
  'https://localhost',
  process.env.FRONTEND_URL,
].filter(Boolean);

// Also allow all Digital Ocean app domains (*.ondigitalocean.app)
const isDigitalOceanOrigin = (origin) => {
  return origin && origin.endsWith('.ondigitalocean.app')
}

// Check if origin is from custom domain (itwos.store)
const isCustomDomainOrigin = (origin) => {
  if (!origin) return false;
  return origin.includes('itwos.store');
}

// Allow local network origins (e.g. Mac IP when app in simulator loads from http://192.168.x.x:5173)
const isLocalNetworkOrigin = (origin) => {
  if (!origin || typeof origin !== 'string') return false;
  try {
    const u = new URL(origin);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const host = u.hostname;
    return host.startsWith('192.168.') || host.startsWith('10.') || host === 'localhost' || host === '127.0.0.1';
  } catch {
    return false;
  }
};

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Check if origin is in allowed list
    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    }
    
    // Allow custom domain (itwos.store and all subdomains)
    if (isCustomDomainOrigin(origin)) {
      return callback(null, true);
    }
    
    // Allow local network (e.g. http://192.168.114.2:5173 when simulator loads from Mac)
    if (isLocalNetworkOrigin(origin)) {
      return callback(null, true);
    }
    
    // Allow all Digital Ocean app deployments (*.ondigitalocean.app)
    if (isDigitalOceanOrigin(origin)) {
      return callback(null, true);
    }
    
    // Allow in development mode
    if (process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }
    
    // Reject all other origins
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  // Explicitly allow all methods iOS might use
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  // Explicitly allow all headers iOS might send
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'Access-Control-Request-Method',
    'Access-Control-Request-Headers',
  ],
  // Expose headers iOS might need
  exposedHeaders: ['Set-Cookie', 'X-Cookie-Set', 'X-Cookie-SameSite', 'X-Cookie-Secure'],
  // Handle preflight requests
  preflightContinue: false,
  optionsSuccessStatus: 204,
};

const io = new Server(httpServer, {
  cors: {
    ...corsOptions,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  },
  allowEIO3: true,
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
});

const PORT = process.env.PORT || 5001;

// Public OG landing for shared post links (WhatsApp / iMessage) — no auth
app.get('/open/post/:postId', getOpenPostLandingHtml);

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Database connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/chatapp')
  .then(() => console.log('MongoDB connected successfully'))
  .catch((error) => console.error('MongoDB connection error:', error));

// Routes - mount specific /api/user/* paths BEFORE generic /api/user (so /:id does not match "demo-bookings", etc.)
app.use('/api/user/demo-bookings', demoBookingRoutes);
app.use('/api/user/friends', friendRequestRoutes);
app.use('/api/user/chat', chatRoutes);
// Register before postRoutes so this POST always hits (avoids 404 if nested router does not match in some environments)
app.post(
  '/api/user/posts/add-to-profile/:postId',
  authenticate,
  authorize('user'),
  addPostToProfile
);
app.use('/api/user/posts', postRoutes);
app.use('/api/user/subscriptions', subscriptionRoutes);
app.use('/api/user/stories', storyRoutes);
app.use('/api/user/memories', memoryRoutes);
// Profile likes — top-level routes (same pattern as add-to-profile) so POST/GET always hit before user router
app.get('/api/user/profile/:id/likes', getProfileTotalLikes);
app.get('/api/user/profile/:id/like-status', optionalAuthenticate, getProfileLikeStatus);
app.get('/api/user/profile/:id/likers', getProfileLikers);
app.post('/api/user/profile/:id/like', authenticate, postProfileLike);
app.use('/api/user', userRoutes);
app.use('/api/profile', profileLikeRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin', adminProfileLikeRoutes);
app.use('/api/admin', adminProfileReportRoutes);
app.use('/api/admin/users', adminUserRoutes);
app.use('/api/admin/teams', adminTeamRoutes);
app.use('/api/admin/bookings', adminBookingRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/admin/chat', adminChatRoutes);
app.use('/api/admin/chat-themes', adminChatThemeRoutes);
app.use('/api/admin/subscriptions', adminSubscriptionRoutes);
app.use('/api/banners', bannerRoutes);
app.use('/api/fonts', fontRoutes);
app.use('/api/admin/banners', adminBannerRoutes);
app.use('/api/admin/fonts', adminFontRoutes);
app.use('/api/admin/stories', adminStoryRoutes);
app.use('/api/admin/posts', adminPostRoutes);
app.use('/api/music', musicRoutes);
app.use('/api/count', countRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/admin/rules', adminRuleRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/admin/abuse', abuseRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/search', searchRoutes);
app.use('/api', healthRoutes); // Health and diagnostic routes

// Root route - API information
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'ITWOS Chat API Server',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      testCookies: '/api/test-cookies',
      user: '/api/user/*',
      admin: '/api/admin/*',
      notifications: '/api/notifications/*',
      posts: '/api/user/posts/*',
      stories: '/api/user/stories/*',
      chat: '/api/user/chat/*',
    },
    documentation: 'API endpoints are available under /api/*',
    timestamp: new Date().toISOString(),
  });
});

// Global error handler middleware (must be after all routes)
app.use((err, req, res, _next) => {
  console.error('[Global Error Handler]', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString()
  });

  // CORS error
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      success: false,
      message: 'CORS error: Origin not allowed',
      origin: req.headers.origin
    });
  }

  // Default error response
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler for undefined routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.path}`
  });
});

// Socket.IO connection handling — server-side source of truth for "online" (used for push logic)
const connectedUsers = new Map(); // userId (string) -> socket.id

io.use(async (socket, next) => {
  try {
    const userId = await authenticateSocket(socket);
    if (userId) {
      socket.userId = userId;
      next();
    } else {
      next(new Error('Authentication failed'));
    }
  } catch (_error) {
    next(new Error('Authentication failed'));
  }
});

io.on('connection', async (socket) => {
  const userId = socket.userId;
  if (!userId) {
    socket.disconnect();
    return;
  }

  const userIdStr = userId.toString();
  connectedUsers.set(userIdStr, socket.id);
  console.log(`User connected: ${userIdStr}`);

  // Join user's personal room
  socket.join(`user:${userId}`);

  // Update user online status
  try {
    const User = (await import('./models/User.js')).default;
    const user = await User.findById(userId);
    if (user) {
      user.onlineStatus = 'online';
      user.lastSeen = new Date();
      await user.save();

      // Emit online status to friends
      const FriendRequest = (await import('./models/FriendRequest.js')).default;
      const friendships = await FriendRequest.find({
        $or: [
          { fromUser: userId, status: 'accepted' },
          { toUser: userId, status: 'accepted' }
        ]
      });

      friendships.forEach(async (fr) => {
        const friendId = fr.fromUser.toString() === userId.toString() 
          ? fr.toUser.toString() 
          : fr.fromUser.toString();
        io.to(`user:${friendId}`).emit('user-online', { userId, status: 'online' });
      });

      // Check if user is admin and join admin room
      if (user.role === 'admin') {
        socket.join('admin');
        socket.join('admin-room'); // Keep for backward compatibility
        console.log(`Admin connected: ${userId}`);
      }
      
      // Join user-specific room for support notifications
      socket.join(`user-${userId}`);
    }
  } catch (error) {
    console.error('Error updating user status:', error);
  }

  // Handle chat messages
  socket.on('send-message', async (data) => {
    try {
      const { chatId, receiverId, message } = data;
      
      // Emit to receiver with 'sent' status
      io.to(`user:${receiverId}`).emit('new-message', {
        chatId,
        message: {
          ...message,
          status: 'sent'
        },
        senderId: userId
      });

      // Emit back to sender for confirmation
      socket.emit('message-sent', { chatId, message: { ...message, status: 'sent' } });
    } catch (error) {
      console.error('Error handling send-message:', error);
      socket.emit('message-error', { error: error.message });
    }
  });

  // Handle message delivered status
  socket.on('message-delivered', async (data) => {
    try {
      const { messageId, chatId: _chatId } = data;
      const Message = (await import('./models/Message.js')).default;
      
      const message = await Message.findById(messageId).select('sender').lean();
      if (!message) return;

      await Message.updateOne(
        { _id: messageId, status: 'sent' },
        {
          status: 'delivered',
          deliveredAt: new Date()
        }
      );

      // Notify sender that message was delivered
      io.to(`user:${message.sender}`).emit('message-status-updated', {
        messageId,
        status: 'delivered'
      });
    } catch (error) {
      console.error('Error updating delivered status:', error);
    }
  });

  // Handle message read status
  socket.on('message-read', async (data) => {
    try {
      const { messageId, chatId } = data;
      const Message = (await import('./models/Message.js')).default;
      
      const message = await Message.findById(messageId).select('sender status').lean();
      if (!message) return;

      // Only update if not already read
      if (message.status !== 'read') {
        await Message.updateOne(
          { _id: messageId },
          {
            status: 'read',
            isRead: true,
            readAt: new Date()
          }
        );

        // Notify sender that message was read (include chatId for optimistic UI update)
        io.to(`user:${message.sender}`).emit('message-status-updated', {
          chatId,
          messageId,
          status: 'read'
        });
      }
    } catch (error) {
      console.error('Error updating read status:', error);
    }
  });

  // Handle typing indicator
  socket.on('typing', (data) => {
    const { chatId, receiverId } = data;
    io.to(`user:${receiverId}`).emit('user-typing', {
      chatId,
      userId,
      isTyping: true
    });
  });

  socket.on('stop-typing', (data) => {
    const { chatId, receiverId } = data;
    io.to(`user:${receiverId}`).emit('user-typing', {
      chatId,
      userId,
      isTyping: false
    });
  });

  socket.on('join_profile', (data) => {
    const pid = data?.profileId;
    if (!pid || typeof pid !== 'string' || !/^[0-9a-fA-F]{24}$/.test(pid)) return;
    socket.join(`profile_${pid}`);
  });

  socket.on('leave_profile', (data) => {
    const pid = data?.profileId;
    if (!pid || typeof pid !== 'string') return;
    socket.leave(`profile_${pid}`);
  });

  socket.on('disconnect', async () => {
    connectedUsers.delete(userId);
    console.log(`User disconnected: ${userId}`);

    // Update user offline status
    try {
      const User = (await import('./models/User.js')).default;
      const user = await User.findById(userId);
      if (user) {
        user.onlineStatus = 'offline';
        user.lastSeen = new Date();
        await user.save();

        // Emit offline status to friends
        const FriendRequest = (await import('./models/FriendRequest.js')).default;
        const friendships = await FriendRequest.find({
          $or: [
            { fromUser: userId, status: 'accepted' },
            { toUser: userId, status: 'accepted' }
          ]
        });

        friendships.forEach(async (fr) => {
          const friendId = fr.fromUser.toString() === userId.toString() 
            ? fr.toUser.toString() 
            : fr.fromUser.toString();
          io.to(`user:${friendId}`).emit('user-offline', { userId, status: 'offline' });
        });
      }
    } catch (error) {
      console.error('Error updating offline status:', error);
    }
  });
});

// Helper function to emit notifications
const emitNotification = (userId, notification) => {
  io.to(`user:${userId}`).emit('new-notification', notification);
};

// Helper function to emit to admin room
const emitToAdminRoom = (notification) => {
  io.to('admin-room').emit('new-notification', notification);
};

/** Story owner: refetch viewers list when someone views or likes (real-time). */
const emitStoryViewersUpdated = (ownerUserId, payload) => {
  if (!ownerUserId || !payload?.storyId) return;
  const uid = typeof ownerUserId === 'string' ? ownerUserId : ownerUserId.toString?.();
  if (!uid) return;
  io.to(`user:${uid}`).emit('story-viewers-updated', payload);
};

// Make io and presence available to controllers
app.set('io', io);
app.set('isUserConnected', (userId) => {
  if (!userId) return false;
  const id = typeof userId === 'string' ? userId : (userId.toString && userId.toString());
  return id ? connectedUsers.has(id) : false;
});

export { io, emitNotification, emitToAdminRoom, emitStoryViewersUpdated };

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log('Hi ITWOS');
  console.log(`Server is running on port ${PORT}`);
  console.log(`Socket.IO server is ready`);
  const hasVapid = !!(process.env.VAPID_PUBLIC_KEY || '').trim() && !!(process.env.VAPID_PRIVATE_KEY || '').trim();
  console.log(hasVapid ? '[Push] VAPID keys: configured' : '[Push] VAPID keys: MISSING — set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in .env (or production env)');
  // Cron jobs run in a separate service (node cron.js). Set CRON_DISABLED=1 on API instances.
});

