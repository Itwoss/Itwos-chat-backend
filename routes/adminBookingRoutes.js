import express from 'express';
import { body } from 'express-validator';
import {
  getAllBookings,
  getBookingById,
  updateBookingStatus,
  deleteBooking
} from '../controllers/adminBookingController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// All routes require admin authentication
router.use(authenticate);
router.use(authorize('admin'));

// Validation rules
const updateStatusValidation = [
  body('status')
    .optional()
    .isIn(['pending', 'confirmed', 'cancelled', 'completed'])
    .withMessage('Invalid status'),
  body('adminNotes')
    .optional()
    .trim()
];

// Routes
router.get('/', getAllBookings);
router.get('/:id', getBookingById);
router.put('/:id', updateStatusValidation, updateBookingStatus);
router.delete('/:id', deleteBooking);

export default router;

