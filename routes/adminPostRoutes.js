import express from 'express';
import {
  getAllPosts,
  getPostById,
  removePost,
  restorePost,
  deletePostPermanently,
  warnUserForPost,
  getPostStats
} from '../controllers/adminPostController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { body } from 'express-validator';

const router = express.Router();

// All routes require authentication and admin role
router.use(authenticate);
router.use(authorize('admin'));

// Validation
const removePostValidation = [
  body('reason')
    .trim()
    .notEmpty().withMessage('Removal reason is required')
    .isLength({ min: 10 }).withMessage('Reason must be at least 10 characters')
];

const warnUserValidation = [
  body('reason')
    .trim()
    .notEmpty().withMessage('Warning reason is required')
    .isLength({ min: 10 }).withMessage('Reason must be at least 10 characters')
];

// Admin post routes
router.get('/', getAllPosts);
router.get('/stats', getPostStats);
router.get('/:id', getPostById);
router.post('/:id/remove', removePostValidation, removePost);
router.post('/:id/restore', restorePost);
router.post('/:id/warn', warnUserValidation, warnUserForPost);
router.delete('/:id', deletePostPermanently);

export default router;

