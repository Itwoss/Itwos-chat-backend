import express from 'express';
import {
  getPlans,
  getMySubscription,
  createOrder,
  verifyPayment,
  cancelSubscription
} from '../controllers/subscriptionController.js';
import { authenticate } from '../middleware/auth.js';
import { handleWebhook } from '../controllers/razorpayWebhookController.js';

const router = express.Router();

// Public routes
router.get('/plans', getPlans);

// User routes (require authentication)
router.get('/my-subscription', authenticate, getMySubscription);
router.post('/create-order', authenticate, createOrder);
router.post('/verify-payment', authenticate, verifyPayment);
router.post('/cancel', authenticate, cancelSubscription);

// Razorpay webhook (no authentication - uses signature verification)
router.post('/webhook', express.raw({ type: 'application/json' }), handleWebhook);

export default router;



