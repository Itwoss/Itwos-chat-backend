import express from 'express';
import { body } from 'express-validator';
import {
  getAllProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  deleteProjectFile
} from '../controllers/adminProjectController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { uploadMultiple } from '../middleware/upload.js';

const router = express.Router();

// Validation rules
const createProjectValidation = [
  body('websiteTitle')
    .trim()
    .notEmpty().withMessage('Website title is required'),
  body('link')
    .trim()
    .notEmpty().withMessage('Link is required')
    .isURL().withMessage('Please provide a valid URL'),
  body('description')
    .trim()
    .notEmpty().withMessage('Description is required'),
  body('techStack')
    .optional(),
  body('teamMembers')
    .optional(),
];

const updateProjectValidation = [
  body('websiteTitle')
    .optional()
    .trim()
    .notEmpty().withMessage('Website title is required'),
  body('link')
    .optional()
    .trim()
    .isURL().withMessage('Please provide a valid URL'),
  body('description')
    .optional()
    .trim()
    .notEmpty().withMessage('Description is required'),
];

// All routes require admin authentication
router.use(authenticate);
router.use(authorize('admin'));

// Routes
router.get('/', getAllProjects);
router.get('/:id', getProjectById);
router.post('/', uploadMultiple, createProjectValidation, createProject);
router.put('/:id', uploadMultiple, updateProjectValidation, updateProject);
router.delete('/:id', deleteProject);
router.delete('/:projectId/files/:fileUrl', deleteProjectFile);

export default router;

