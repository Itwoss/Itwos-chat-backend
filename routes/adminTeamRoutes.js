import express from 'express';
import { body } from 'express-validator';
import {
  getAllTeams,
  getTeamById,
  createTeam,
  updateTeam,
  deleteTeam
} from '../controllers/adminTeamController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { uploadSingle } from '../middleware/upload.js';

const router = express.Router();

// Validation rules
const createTeamValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 50 }).withMessage('Name must be between 2 and 50 characters'),
  body('role')
    .trim()
    .notEmpty().withMessage('Role is required'),
  body('email')
    .optional()
    .trim()
    .isEmail().withMessage('Please provide a valid email'),
];

const updateTeamValidation = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 }).withMessage('Name must be between 2 and 50 characters'),
  body('role')
    .optional()
    .trim()
    .notEmpty().withMessage('Role is required'),
  body('email')
    .optional()
    .trim()
    .isEmail().withMessage('Please provide a valid email'),
];

// All routes require admin authentication
router.use(authenticate);
router.use(authorize('admin'));

// Routes
router.get('/', getAllTeams);
router.get('/:id', getTeamById);
router.post('/', uploadSingle, createTeamValidation, createTeam);
router.put('/:id', uploadSingle, updateTeamValidation, updateTeam);
router.delete('/:id', deleteTeam);

export default router;

