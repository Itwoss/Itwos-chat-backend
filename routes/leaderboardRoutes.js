import express from 'express';
import {
  getLeaderboard,
  getLeaderboardSnapshot,
  getUserRankHistory
} from '../controllers/leaderboardController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Public/authenticated routes
router.get('/', authenticate, getLeaderboard);
router.get('/snapshot', getLeaderboardSnapshot);
router.get('/me/history', authenticate, getUserRankHistory);

export default router;

