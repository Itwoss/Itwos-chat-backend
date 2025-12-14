import express from 'express';
import { body } from 'express-validator';
import {
  createPost,
  getFeed,
  getUserPosts,
  toggleLike,
  addComment,
  deletePost,
  archivePost,
  unarchivePost
} from '../controllers/postController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { uploadMultiple } from '../middleware/upload.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);
router.use(authorize('user'));

// Validation rules
const createPostValidation = [
  body('content')
    .trim()
    .notEmpty().withMessage('Post content is required')
    .isLength({ max: 2000 }).withMessage('Post content must be less than 2000 characters')
];

const addCommentValidation = [
  body('content')
    .trim()
    .notEmpty().withMessage('Comment content is required')
    .isLength({ max: 500 }).withMessage('Comment must be less than 500 characters')
];

// Routes
router.post('/', uploadMultiple, createPostValidation, createPost);
router.get('/feed', getFeed);
router.get('/user/:userId', getUserPosts);
router.post('/:postId/like', toggleLike);
router.post('/:postId/comment', addCommentValidation, addComment);
router.post('/:postId/archive', archivePost);
router.post('/:postId/unarchive', unarchivePost);
router.delete('/:postId', deletePost);

export default router;

