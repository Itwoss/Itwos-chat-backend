import express from 'express';
import { body } from 'express-validator';
import {
  getOrCreateChat,
  getUserChats,
  getChatMessages,
  sendMessage,
  deleteMessage,
  markMessagesAsRead,
  getUnreadCount
} from '../controllers/chatController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { uploadSingle } from '../middleware/upload.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);
router.use(authorize('user'));

// Routes
router.get('/chats', getUserChats);
router.get('/chat/:userId', getOrCreateChat);
router.get('/chat/:chatId/messages', getChatMessages);
router.post('/message', uploadSingle, sendMessage); // Add multer middleware - validation handled in controller
router.delete('/message/:messageId', deleteMessage);
router.put('/chat/:chatId/read', markMessagesAsRead);
router.get('/unread-count', getUnreadCount);

export default router;

