import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  listAdminProfileLikes,
  deleteAdminProfileLike,
  getAdminProfileLikeStats,
} from '../controllers/adminProfileLikeController.js';

const router = express.Router();

router.get('/profile-likes/stats', authenticate, authorize('admin'), getAdminProfileLikeStats);
router.get('/profile-likes', authenticate, authorize('admin'), listAdminProfileLikes);
router.delete('/profile-likes/:id', authenticate, authorize('admin'), deleteAdminProfileLike);

export default router;
