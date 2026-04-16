import express from 'express';
import { authenticate, optionalAuthenticate } from '../middleware/auth.js';
import {
  postProfileLike,
  deleteProfileLikeToday,
  getProfileTotalLikes,
  getProfileLikeStatus,
  getProfileLikers,
} from '../controllers/profileLikeController.js';

const router = express.Router();

router.get('/:id/likes', getProfileTotalLikes);
router.get('/:id/like-status', optionalAuthenticate, getProfileLikeStatus);
router.get('/:id/likers', getProfileLikers);
router.post('/:id/like', authenticate, postProfileLike);
router.delete('/:id/like', authenticate, deleteProfileLikeToday);

export default router;
