import express from 'express';
import { body } from 'express-validator';
import {
  requestMeeting,
  getProjectMeetings,
  scheduleMeeting,
  getAllMeetings,
  cancelMeeting
} from '../controllers/meetingController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// Validation rules
const requestMeetingValidation = [
  body('projectId')
    .notEmpty().withMessage('Project ID is required')
    .isMongoId().withMessage('Invalid project ID'),
  body('requestedDate')
    .notEmpty().withMessage('Requested date is required')
    .isISO8601().withMessage('Please provide a valid date'),
  body('agenda')
    .optional()
    .trim()
];

const scheduleMeetingValidation = [
  body('scheduledDate')
    .notEmpty().withMessage('Scheduled date is required')
    .isISO8601().withMessage('Please provide a valid date'),
  body('scheduledTime')
    .optional()
    .trim(),
  body('meetingLink')
    .optional()
    .trim()
    .isURL().withMessage('Please provide a valid URL'),
  body('meetingPlatform')
    .optional()
    .isIn(['google-meet', 'zoom', 'teams', 'other'])
    .withMessage('Invalid meeting platform'),
  body('notes')
    .optional()
    .trim()
];

// User routes
router.post('/request', authenticate, authorize('user'), requestMeetingValidation, requestMeeting);
router.get('/project/:projectId', authenticate, getProjectMeetings);

// Admin routes
router.get('/all', authenticate, authorize('admin'), getAllMeetings);
router.put('/:id/schedule', authenticate, authorize('admin'), scheduleMeetingValidation, scheduleMeeting);
router.put('/:id/cancel', authenticate, cancelMeeting);

export default router;

