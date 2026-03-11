import express from 'express';
import {
  getAllBanners,
  getBannerById,
  getUserEquippedBanner,
  getUserInventory,
  getMyBannerPayments,
  createBannerOrder,
  verifyBannerPayment,
  purchaseBanner,
  claimFreeBanner,
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
router.get('/user/payments', authenticate, getMyBannerPayments);
router.post('/user/create-order', authenticate, createBannerOrder);
router.post('/user/verify-payment', authenticate, verifyBannerPayment);
router.post('/user/claim-free', authenticate, claimFreeBanner);
router.post('/user/purchase/:id', authenticate, purchaseBanner);
router.post('/user/equip/:id', authenticate, equipBanner);
router.post('/user/unequip', authenticate, unequipBanner);

export default router;



