import express from 'express';
import {
  createMemory,
  getMyMemories,
  getMemoryById,
  updateMemory,
  deleteMemory,
} from '../controllers/memoryController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { uploadForMemory } from '../middleware/upload.js';

const router = express.Router();

router.use(authenticate);
router.use(authorize('user'));

router.post('/', uploadForMemory, createMemory);
router.get('/', getMyMemories);
router.get('/:memoryId', getMemoryById);
router.put('/:memoryId', uploadForMemory, updateMemory);
router.delete('/:memoryId', deleteMemory);

export default router;
