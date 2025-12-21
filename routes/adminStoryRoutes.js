import express from 'express';
import {
  getAllStories,
  getStoryById,
  getStoryStats,
  deleteStory,
  removeStory,
  blockUserFromStories,
  getStoryInteractions,
} from '../controllers/adminStoryController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication and admin role
router.use(authenticate);
router.use(authorize('admin'));

// Admin story routes
router.get('/', getAllStories);
router.get('/stats', getStoryStats);
router.get('/:id', getStoryById);
router.post('/:id/remove', removeStory);
router.delete('/:id', deleteStory);
router.post('/:userId/block', blockUserFromStories);
router.get('/:id/interactions', getStoryInteractions);

export default router;



