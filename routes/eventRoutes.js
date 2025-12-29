import express from 'express';
import {
  createEvent,
  getEvents,
  getActiveEvents,
  completeEvent,
  cancelEvent,
  updateEvent
} from '../controllers/eventController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Public route
router.get('/active', getActiveEvents);

// User route
router.post('/complete', authenticate, completeEvent);

// Admin routes
router.use(authenticate);
router.post('/admin', createEvent);
router.get('/admin', getEvents);
router.put('/admin/:eventId', updateEvent);
router.post('/admin/:eventId/cancel', cancelEvent);

export default router;

