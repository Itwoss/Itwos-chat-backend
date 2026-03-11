import express from 'express';
import { body } from 'express-validator';
import {
  loginAdmin,
  getCurrentAdmin,
  logoutAdmin,
  updateAdminProfile,
  getAdminStats
} from '../controllers/adminController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import {uploadSingle } from '../middleware/upload.js'

const router = express.Router();

// Validation rules
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
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
];

// Routes
router.post('/login', loginValidation, loginAdmin);
// Test endpoint to check cookies
router.get('/test-cookies', (req, res) => {
  res.json({
    success: true,
    cookies: req.cookies,
    adminToken: !!req.cookies.adminToken,
    userToken: !!req.cookies.userToken,
    headers: {
      cookie: req.headers.cookie
    }
  });
});
router.get('/me', authenticate, authorize('admin'), getCurrentAdmin);
router.get('/stats', authenticate, authorize('admin'), getAdminStats);
router.post('/logout', authenticate, authorize('admin'), logoutAdmin);
router.put('/profile', authenticate, authorize('admin'), uploadSingle, updateProfileValidation, updateAdminProfile);

export default router;

