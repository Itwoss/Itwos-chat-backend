import express from 'express';
import { body } from 'express-validator';
import {
  getUserClientProjects,
  getClientProjectById,
  addClientNote
} from '../controllers/clientProjectController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// All routes require user authentication
router.use(authenticate);
router.use(authorize('user'));

// Validation rules
const addNoteValidation = [
  body('note')
    .trim()
    .notEmpty().withMessage('Note is required')
    .isLength({ min: 3 }).withMessage('Note must be at least 3 characters')
];

// Routes
router.get('/', getUserClientProjects);
router.get('/:id', getClientProjectById);
router.post('/:id/notes', addNoteValidation, addClientNote);

export default router;

