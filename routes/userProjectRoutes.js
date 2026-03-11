import express from 'express';
import {
  getAllActiveProjects,
  getProjectById
} from '../controllers/userProjectController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// All routes require user authentication and user role
router.use(authenticate);
router.use(authorize('user'));

// Routes
router.get('/', getAllActiveProjects);
router.get('/:id', getProjectById);

export default router;

