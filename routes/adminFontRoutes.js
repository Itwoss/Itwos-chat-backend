import express from 'express';
import {
  getAllFontsAdmin,
  getFontByIdAdmin,
  createFont,
  updateFont,
  deleteFont,
} from '../controllers/adminFontController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);
router.use(authorize('admin'));

router.get('/', getAllFontsAdmin);
router.get('/:id', getFontByIdAdmin);
router.post('/', createFont);
router.put('/:id', updateFont);
router.delete('/:id', deleteFont);

export default router;
