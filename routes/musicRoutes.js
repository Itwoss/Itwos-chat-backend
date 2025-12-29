import express from 'express';
import { searchTracks } from '../controllers/musicController.js';

const router = express.Router();

// Public route - no authentication required for music search
router.get('/search', searchTracks);

export default router;

