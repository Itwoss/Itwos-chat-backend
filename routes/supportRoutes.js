import express from 'express';
import {
  createSupportTicket,
  getUserTickets,
  getTicketById,
  addTicketResponse,
  getAllTickets,
  getAdminTicketById,
  addAdminResponse,
  updateTicketStatus
} from '../controllers/supportController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// User routes
router.post('/', authenticate, createSupportTicket);
router.get('/me', authenticate, getUserTickets);
router.get('/me/:ticketId', authenticate, getTicketById);
router.post('/:ticketId/response', authenticate, addTicketResponse);

// Admin routes
router.get('/admin/all', authenticate, getAllTickets);
router.get('/admin/:ticketId', authenticate, getAdminTicketById);
router.post('/admin/:ticketId/response', authenticate, addAdminResponse);
router.put('/admin/:ticketId/status', authenticate, updateTicketStatus);

export default router;


