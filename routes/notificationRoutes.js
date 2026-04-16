import express from 'express';
import {
  getUserNotifications,
  markAsRead,
  markAsUnread,
  markAllAsRead,
  deleteNotification
} from '../controllers/notificationController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Routes
router.get('/', getUserNotifications);
router.put('/:id/read', markAsRead);
router.put('/:id/unread', markAsUnread);
router.put('/read-all', markAllAsRead);
router.delete('/:id', deleteNotification);

export default router;

