import express from 'express';
import { body } from 'express-validator';
import {
  getUserSuggestions,
  getUsersNearYou,
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  cancelFriendRequest,
  getFriendRequests,
  getUserFriends,
  unfriend,
  followUser,
  unfollowUser,
  getFollowers,
  getFollowing,
  getFollowStats
} from '../controllers/friendRequestController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);
router.use(authorize('user'));

// Validation
const sendRequestValidation = [
  body('toUserId')
    .notEmpty().withMessage('User ID is required')
    .isMongoId().withMessage('Invalid user ID')
];

// Routes
router.get('/suggestions', getUserSuggestions);
router.get('/near-you', getUsersNearYou);
router.get('/requests', getFriendRequests);
router.get('/friends', getUserFriends);
router.get('/followers', getFollowers);
router.get('/following', getFollowing);
router.get('/stats', getFollowStats);
router.post('/send', sendRequestValidation, sendFriendRequest);
router.post('/follow/:userId', followUser);
router.delete('/unfollow/:userId', unfollowUser);
router.put('/accept/:requestId', acceptFriendRequest);
router.put('/reject/:requestId', rejectFriendRequest);
router.put('/cancel/:requestId', cancelFriendRequest);
router.delete('/unfriend/:friendId', unfriend);

export default router;

