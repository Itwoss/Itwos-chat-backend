import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import userRoutes from './routes/userRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import adminUserRoutes from './routes/adminUserRoutes.js';
import adminTeamRoutes from './routes/adminTeamRoutes.js';
import adminProjectRoutes from './routes/adminProjectRoutes.js';
import userProjectRoutes from './routes/userProjectRoutes.js';
import demoBookingRoutes from './routes/demoBookingRoutes.js';
import adminBookingRoutes from './routes/adminBookingRoutes.js';
import adminClientProjectRoutes from './routes/adminClientProjectRoutes.js';
import userClientProjectRoutes from './routes/userClientProjectRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import meetingRoutes from './routes/meetingRoutes.js';
import friendRequestRoutes from './routes/friendRequestRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import adminChatRoutes from './routes/adminChatRoutes.js';
import postRoutes from './routes/postRoutes.js';
import { authenticateSocket } from './middleware/socketAuth.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true
  }
});

const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Database connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/chatapp')
  .then(() => console.log('MongoDB connected successfully'))
  .catch((error) => console.error('MongoDB connection error:', error));

// Routes
app.use('/api/user', userRoutes);
app.use('/api/user/projects', userProjectRoutes);
app.use('/api/user/demo-bookings', demoBookingRoutes);
app.use('/api/user/client-projects', userClientProjectRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/users', adminUserRoutes);
app.use('/api/admin/teams', adminTeamRoutes);
app.use('/api/admin/projects', adminProjectRoutes);
app.use('/api/admin/bookings', adminBookingRoutes);
app.use('/api/admin/client-projects', adminClientProjectRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/user/friends', friendRequestRoutes);
app.use('/api/user/chat', chatRoutes);
app.use('/api/admin/chat', adminChatRoutes);
app.use('/api/user/posts', postRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// Socket.IO connection handling
const connectedUsers = new Map(); // userId -> socketId

io.use(async (socket, next) => {
  try {
    const userId = await authenticateSocket(socket);
    if (userId) {
      socket.userId = userId;
      next();
    } else {
      next(new Error('Authentication failed'));
    }
  } catch (error) {
    next(new Error('Authentication failed'));
  }
});

io.on('connection', async (socket) => {
  const userId = socket.userId;
  if (!userId) {
    socket.disconnect();
    return;
  }

  connectedUsers.set(userId, socket.id);
  console.log(`User connected: ${userId}`);

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
        socket.join('admin-room');
      }
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
      const { messageId, chatId } = data;
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

        // Notify sender that message was read
        io.to(`user:${message.sender}`).emit('message-status-updated', {
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

// Export io and helper functions for use in controllers
export { io, emitNotification, emitToAdminRoom };

httpServer.listen(PORT, () => {
  console.log('Hi ITWOS')
  console.log(`Server is running on port ${PORT}`);
  console.log(`Socket.IO server is ready`);
});

