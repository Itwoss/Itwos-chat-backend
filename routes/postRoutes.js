import express from 'express';
import { body } from 'express-validator';
import {
  createPost,
  updatePost,
  getFeed,
  getTrendingSections,
  getUserPosts,
  getPostById,
  getSavedPosts,
  updateSavedPostFolder,
  addPostToProfile,
  removePostAdd,
  getMyPostAdditions,
  getUserAddedPosts,
  savePost,
  unsavePost,
  toggleLike,
  addComment,
  deletePost,
  archivePost,
  unarchivePost,
  incrementPostView
} from '../controllers/postController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { uploadForPost } from '../middleware/upload.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);
router.use(authorize('user'));

// Validation rules
const createPostValidation = [
  body('title')
    .trim()
    .notEmpty().withMessage('Post title is required')
    .isLength({ max: 1000 }).withMessage('Post title must be less than 1000 characters'),
  body('content')
    .optional()
    .trim()
    .isLength({ max: 2000 }).withMessage('Post content must be less than 2000 characters')
];

const addCommentValidation = [
  body('content')
    .trim()
    .notEmpty().withMessage('Comment content is required')
    .isLength({ max: 500 }).withMessage('Comment must be less than 500 characters')
];

// Routes (specific paths before /:postId so "saved" is not treated as postId)
router.post('/', uploadForPost, createPostValidation, createPost);
router.get('/feed', getFeed);
router.get('/trending-sections', getTrendingSections);
router.get('/additions/mine', getMyPostAdditions);
router.get('/user/:userId/added', getUserAddedPosts);
router.get('/user/:userId', getUserPosts);
router.get('/saved', getSavedPosts);
router.put('/saved/:postId/folder', updateSavedPostFolder);
// Static path first (avoids any ambiguity with /:postId); same handler as /:postId/add
router.post('/add-to-profile/:postId', addPostToProfile);
// All POST /:postId/* before bare /:postId (PUT/GET/DELETE) so subpaths always match
router.post('/:postId/add', addPostToProfile);
router.post('/:postId/remove-add', removePostAdd);
router.post('/:postId/save', savePost);
router.post('/:postId/unsave', unsavePost);
router.post('/:postId/like', toggleLike);
router.post('/:postId/comment', addCommentValidation, addComment);
router.post('/:postId/view', incrementPostView);
router.post('/:postId/archive', archivePost);
router.post('/:postId/unarchive', unarchivePost);
router.put('/:postId', uploadForPost, updatePost);
router.get('/:postId', getPostById);
router.delete('/:postId', deletePost);

export default router;

