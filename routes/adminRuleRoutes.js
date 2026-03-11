import express from 'express';
import {
  getRules,
  updateRules,
  toggleRule
} from '../controllers/adminRuleController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// All routes require admin authentication
router.use(authenticate);

router.get('/', getRules);
router.put('/', updateRules);
router.post('/toggle', toggleRule);

export default router;

