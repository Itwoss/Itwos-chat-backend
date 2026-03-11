import express from 'express';
import { body } from 'express-validator';
import {
  registerUser,
  loginUser,
  getCurrentUser,
  getUserById,
  logoutUser,
  updateUserProfile
} from '../controllers/userController.js';
import {
  getVapidPublicKey,
  savePushSubscription,
  removePushSubscription,
  sendTestPush,
} from '../controllers/pushSubscriptionController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { uploadSingle } from '../middleware/upload.js';

const router = express.Router();

// Validation rules
const registerValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 50 }).withMessage('Name must be between 2 and 50 characters'),
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email'),
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('countryCode')
    .trim()
    .notEmpty().withMessage('Country code is required'),
  body('phoneNumber')
    .trim()
    .notEmpty().withMessage('Phone number is required')
    .matches(/^\d{6,15}$/).withMessage('Phone number must be 6-15 digits')
];

const loginValidation = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email'),
  body('password')
    .notEmpty().withMessage('Password is required')
];

// Validation rules
const updateProfileValidation = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
  body('email')
    .optional()
    .trim()
    .isEmail().withMessage('Please provide a valid email'),
  body('password')
    .optional()
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('countryCode')
    .optional()
    .trim()
    .notEmpty().withMessage('Country code is required'),
  body('phoneNumber')
    .optional()
    .trim()
    .matches(/^\d{6,15}$/).withMessage('Phone number must be 6-15 digits'),
  body('bio')
    .optional()
    .isString().withMessage('Bio must be a string')
    .isLength({ max: 500 }).withMessage('Bio cannot exceed 500 characters')
];

// Routes
router.post('/register', registerValidation, registerUser);
router.post('/login', loginValidation, loginUser);
router.get('/me', authenticate, authorize('user'), getCurrentUser);
// Push notifications (specific paths before /:id)
router.get('/push-subscription/vapid-public-key', getVapidPublicKey);
router.post('/push-subscription', authenticate, authorize('user'), savePushSubscription);
router.delete('/push-subscription', authenticate, authorize('user'), removePushSubscription);
router.post('/push-subscription/test', authenticate, authorize('user'), sendTestPush);
// Only match valid MongoDB ObjectId (24 hex chars) so paths like "client-projects" or "demo-bookings" are not treated as user IDs
router.get('/:id([0-9a-fA-F]{24})', authenticate, authorize('user'), getUserById);
router.post('/logout', authenticate, authorize('user'), logoutUser);
router.put('/profile', authenticate, authorize('user'), uploadSingle, updateProfileValidation, updateUserProfile);

export default router;

