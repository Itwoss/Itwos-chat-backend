import express from 'express';
import {
  createStory,
  getStoriesFeed,
  getStoryById,
  viewStory,
  reactToStory,
  replyToStory,
  getStoryViewers,
  deleteStory,
  getMyStories,
} from '../controllers/storyController.js';
import { authenticate } from '../middleware/auth.js';
import { uploadFields } from '../middleware/upload.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// User story routes
router.post('/', uploadFields, createStory); // uploadFields handles media and music file uploads
router.get('/feed', getStoriesFeed);
router.get('/my-stories', getMyStories);
router.get('/:id', getStoryById);
router.post('/:id/view', viewStory);
router.post('/:id/react', reactToStory);
router.post('/:id/reply', replyToStory);
router.get('/:id/viewers', getStoryViewers);
router.delete('/:id', deleteStory);

export default router;

