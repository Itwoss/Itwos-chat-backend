import express from 'express';
import {
  getAllFonts,
  getFontById,
  getUserFontInventory,
  purchaseFont,
  equipFont,
  unequipFont,
} from '../controllers/fontController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.get('/', getAllFonts);
router.get('/user/inventory', authenticate, getUserFontInventory);
router.post('/user/purchase/:id', authenticate, purchaseFont);
router.post('/user/equip/:id', authenticate, equipFont);
router.post('/user/unequip', authenticate, unequipFont);
router.get('/:id', getFontById);

export default router;
