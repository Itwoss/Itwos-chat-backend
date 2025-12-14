import express from 'express';
import { body } from 'express-validator';
import {
  convertBookingToProject,
  getAllClientProjects,
  getClientProjectById,
  updateClientProject,
  deleteClientProject
} from '../controllers/clientProjectController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { uploadMultiple } from '../middleware/upload.js';

const router = express.Router();

// All routes require admin authentication
router.use(authenticate);
router.use(authorize('admin'));

// Validation rules
const convertBookingValidation = [
  body('bookingId')
    .notEmpty().withMessage('Booking ID is required')
    .isMongoId().withMessage('Invalid booking ID'),
  body('projectTitle')
    .optional()
    .trim()
    .isLength({ min: 3 }).withMessage('Project title must be at least 3 characters'),
  body('description')
    .optional()
    .trim(),
  body('techStack')
    .optional()
    .isArray().withMessage('Tech stack must be an array'),
  body('teamMembers')
    .optional()
    .isArray().withMessage('Team members must be an array')
];

const updateProjectValidation = [
  body('projectTitle')
    .optional()
    .trim()
    .isLength({ min: 3 }).withMessage('Project title must be at least 3 characters'),
  body('status')
    .optional()
    .isIn(['planning', 'in-progress', 'review', 'testing', 'completed', 'on-hold', 'cancelled'])
    .withMessage('Invalid status'),
  body('progress')
    .optional()
    .isInt({ min: 0, max: 100 }).withMessage('Progress must be between 0 and 100'),
  body('techStack')
    .optional()
    .isArray().withMessage('Tech stack must be an array'),
  body('teamMembers')
    .optional()
    .isArray().withMessage('Team members must be an array')
];

// Routes
router.post('/convert', convertBookingValidation, convertBookingToProject);
router.get('/', getAllClientProjects);
router.get('/:id', getClientProjectById);
router.put('/:id', updateProjectValidation, updateClientProject);
router.delete('/:id', deleteClientProject);

export default router;

