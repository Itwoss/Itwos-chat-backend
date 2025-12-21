import express from 'express';
import {
  getAllBanners,
  getBannerById,
  getUserEquippedBanner,
  getUserInventory,
  purchaseBanner,
  equipBanner,
  unequipBanner
} from '../controllers/bannerController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Public routes
router.get('/', getAllBanners);
router.get('/:id', getBannerById);
router.get('/user/:userId/equipped', getUserEquippedBanner);

// User routes (require authentication)
router.get('/user/inventory', authenticate, getUserInventory);
router.post('/user/purchase/:id', authenticate, purchaseBanner);
router.post('/user/equip/:id', authenticate, equipBanner);
router.post('/user/unequip', authenticate, unequipBanner);

export default router;


