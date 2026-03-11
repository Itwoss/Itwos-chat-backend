import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  searchTracks,
  getTrendingTracks,
  getSavedSongs,
  saveSong,
  unsaveSong,
} from '../controllers/musicController.js';

const router = express.Router();

// Public routes - no authentication required
router.get('/search', searchTracks);
router.get('/trending', getTrendingTracks);

// Saved songs - require authentication
router.get('/saved', authenticate, authorize('user'), getSavedSongs);
router.post('/saved', authenticate, authorize('user'), saveSong);
router.delete('/saved/:videoId', authenticate, authorize('user'), unsaveSong);

export default router;

