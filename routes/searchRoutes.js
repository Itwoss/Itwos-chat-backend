import express from 'express';
import { globalSearch } from '../controllers/searchController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticate, authorize('user'), globalSearch);

export default router;
