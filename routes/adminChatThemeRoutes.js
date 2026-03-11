import express from 'express';
import {
  getAllChatThemes,
  getChatThemeById,
  createChatTheme,
  updateChatTheme,
  deleteChatTheme,
} from '../controllers/adminChatThemeController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { uploadSingle } from '../middleware/upload.js';

const router = express.Router();
router.use(authenticate);
router.use(authorize('admin'));

router.get('/', getAllChatThemes);
router.get('/:id', getChatThemeById);
router.post('/', uploadSingle, createChatTheme);
router.put('/:id', uploadSingle, updateChatTheme);
router.delete('/:id', deleteChatTheme);

export default router;
