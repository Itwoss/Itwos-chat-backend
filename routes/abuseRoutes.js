import express from 'express';
import {
  getAbuseLogs,
  reviewAbuseLog,
  flagUser,
  getUserActivityLogs,
  toggleLeaderboardVisibility
} from '../controllers/abuseController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// All routes require admin authentication
router.use(authenticate);

router.get('/logs', getAbuseLogs);
router.post('/logs/:logId/review', reviewAbuseLog);
router.post('/flag', flagUser);
router.get('/user/:userId/activity', getUserActivityLogs);
router.post('/user/:userId/leaderboard-visibility', toggleLeaderboardVisibility);

export default router;

