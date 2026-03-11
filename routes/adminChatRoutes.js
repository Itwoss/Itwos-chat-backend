import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  getUserFriendsAdmin,
  getUserChatsAdmin,
  getChatMessagesAdmin
} from '../controllers/adminChatController.js';

const router = express.Router();

// All routes require admin authentication
router.use(authenticate);
router.use(authorize('admin'));

router.get('/users/:userId/friends', getUserFriendsAdmin);
router.get('/users/:userId/chats', getUserChatsAdmin);
router.get('/chats/:chatId/messages', getChatMessagesAdmin);

export default router;

