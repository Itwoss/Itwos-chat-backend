import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  getAdminProfileReports,
  reviewAdminProfileReport,
} from '../controllers/profileReportController.js';

const router = express.Router();

router.use(authenticate, authorize('admin'));
router.get('/profile-reports', getAdminProfileReports);
router.put('/profile-reports/:reportId/review', reviewAdminProfileReport);

export default router;
