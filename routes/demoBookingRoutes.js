import express from 'express';
import { body } from 'express-validator';
import {
  createDemoBooking,
  getUserBookings
} from '../controllers/demoBookingController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// Validation rules
const createBookingValidation = [
  body('projectId')
    .notEmpty().withMessage('Project ID is required')
    .isMongoId().withMessage('Invalid project ID'),
  body('requirements')
    .trim()
    .notEmpty().withMessage('Requirements are required')
    .isLength({ min: 10 }).withMessage('Requirements must be at least 10 characters'),
  body('projectType')
    .trim()
    .notEmpty().withMessage('Project type is required'),
  body('budget')
    .trim()
    .notEmpty().withMessage('Budget is required'),
  body('deadline')
    .notEmpty().withMessage('Deadline is required')
    .isISO8601().withMessage('Please provide a valid deadline date'),
  body('preferredDate')
    .optional()
    .isISO8601().withMessage('Please provide a valid date'),
  body('preferredTime')
    .optional()
    .trim(),
  body('contactPhone')
    .optional()
    .trim(),
  body('contactEmail')
    .optional()
    .isEmail().withMessage('Please provide a valid email'),
  body('additionalContactInfo')
    .optional()
    .trim()
];

// All routes require user authentication and user role
router.use(authenticate);
router.use(authorize('user'));

// Routes
router.post('/', createBookingValidation, createDemoBooking);
router.get('/', getUserBookings);

export default router;

