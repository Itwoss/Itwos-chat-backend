import express from 'express';
import {
  getAllBannersAdmin,
  getBannerByIdAdmin,
  createBanner,
  updateBanner,
  deleteBanner,
  getBannerStats,
  getBannerPaymentsAdmin,
  syncBannerInventoryAdmin
} from '../controllers/adminBannerController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { uploadSingle } from '../middleware/upload.js';

const router = express.Router();

// All admin routes require authentication and admin role
router.use(authenticate);
router.use(authorize('admin'));

// Admin banner routes
router.get('/', getAllBannersAdmin);
router.get('/stats', getBannerStats);
router.get('/payments', getBannerPaymentsAdmin);
router.post('/sync-inventory', syncBannerInventoryAdmin);
router.get('/:id', getBannerByIdAdmin);
router.post('/', uploadSingle, createBanner);
router.put('/:id', uploadSingle, updateBanner);
router.delete('/:id', deleteBanner);

export default router;

