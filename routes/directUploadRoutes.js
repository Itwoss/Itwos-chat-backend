import express from 'express';
import { getUnifiedDirectUploadConfig } from '../controllers/directUploadController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);
router.use(authorize('user'));

router.get('/direct-config', getUnifiedDirectUploadConfig);

export default router;
