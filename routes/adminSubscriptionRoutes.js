import express from 'express';
import {
  getAllSubscriptions,
  getSubscriptionById,
  updateSubscription,
  revokeSubscription,
  extendSubscription,
  getSubscriptionStats,
  exportSubscriptions
} from '../controllers/adminSubscriptionController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// All routes require admin authentication
router.use(authenticate);
router.use(authorize('admin'));

router.get('/', getAllSubscriptions);
router.get('/stats', getSubscriptionStats);
router.get('/export', exportSubscriptions);
router.get('/:id', getSubscriptionById);
router.put('/:id', updateSubscription);
router.post('/:id/revoke', revokeSubscription);
router.post('/:id/extend', extendSubscription);

export default router;



