import express from 'express';
import { authenticate, optionalAuthenticate } from '../middleware/auth.js';
import {
  postProfileLike,
  getProfileTotalLikes,
  getProfileLikeStatus,
} from '../controllers/profileLikeController.js';

const router = express.Router();

router.get('/:id/likes', getProfileTotalLikes);
router.get('/:id/like-status', optionalAuthenticate, getProfileLikeStatus);
router.post('/:id/like', authenticate, postProfileLike);

export default router;
