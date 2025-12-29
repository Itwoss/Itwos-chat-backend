import express from 'express';
import {
  getUserCount,
  getCountLogs,
  adjustUserCount,
  resetMonthlyCount,
  toggleCountFreeze,
  getCountDashboardStats
} from '../controllers/countController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// User routes
router.get('/me', authenticate, getUserCount);
router.get('/me/logs', authenticate, getCountLogs);

// Admin routes
router.get('/admin/dashboard-stats', authenticate, getCountDashboardStats);
router.post('/admin/adjust', authenticate, adjustUserCount);
router.post('/admin/reset-monthly/:userId', authenticate, resetMonthlyCount);
router.post('/admin/toggle-freeze/:userId', authenticate, toggleCountFreeze);

export default router;

