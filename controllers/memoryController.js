import Memory from '../models/Memory.js';
import cloudinary from '../utils/cloudinary.js';
import fs from 'fs';

/**
 * Create a new memory. Only the authenticated user is set as owner.
 * Memories are private and never shown in feed or to other users.
 */
export const createMemory = async (req, res) => {
  try {
    const userId = req.user._id;
    const { caption, memoryDate } = req.body;
    const fileList = req.files?.files || [];
    const files = Array.isArray(fileList) ? fileList : [];

    if (!memoryDate) {
      return res.status(400).json({
        success: false,
        message: 'Memory date is required (date/year when the memory is from)',
      });
    }

    const parsedDate = new Date(memoryDate);
    if (Number.isNaN(parsedDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid memory date',
      });
    }

    if (!files.length) {
      return res.status(400).json({
        success: false,
        message: 'At least one image is required',
      });
    }

    const imageUrls = [];
    for (const file of files) {
      if (!file.mimetype.startsWith('image/')) continue;
      try {
        const result = await cloudinary.uploader.upload(file.path, {
          folder: 'chat-app/memories',
          resource_type: 'image',
        });
        imageUrls.push(result.secure_url);
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      } catch (e) {
        console.error('Error uploading memory image:', e);
      }
    }

    if (imageUrls.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid images could be uploaded',
      });
    }

    const memory = await Memory.create({
      user: userId,
      images: imageUrls,
      caption: (caption || '').trim().slice(0, 500),
      memoryDate: parsedDate,
    });

    return res.status(201).json({
      success: true,
      data: memory,
    });
  } catch (err) {
    console.error('createMemory error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to create memory',
    });
  }
};

/**
 * Get all memories for the current user only.
 * Query: sort=asc (oldest first) | sort=desc (newest first, default)
 */
export const getMyMemories = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page = 1, limit = 50, sort = 'desc' } = req.query;
    const order = sort === 'asc' ? 1 : -1;
    const skip = (Math.max(1, parseInt(page, 10)) - 1) * Math.min(50, Math.max(1, parseInt(limit, 10)));

    const [memories, total] = await Promise.all([
      Memory.find({ user: userId })
        .sort({ memoryDate: order, createdAt: order })
        .skip(skip)
        .limit(Math.min(50, Math.max(1, parseInt(limit, 10))))
        .lean(),
      Memory.countDocuments({ user: userId }),
    ]);

    return res.json({
      success: true,
      data: memories,
      pagination: { page: parseInt(page, 10), limit: parseInt(limit, 10), total },
    });
  } catch (err) {
    console.error('getMyMemories error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to fetch memories',
    });
  }
};

/**
 * Get a single memory by ID. Only allowed for the owner.
 */
export const getMemoryById = async (req, res) => {
  try {
    const userId = req.user._id;
    const { memoryId } = req.params;
    const memory = await Memory.findOne({ _id: memoryId, user: userId }).lean();
    if (!memory) {
      return res.status(404).json({ success: false, message: 'Memory not found' });
    }
    return res.json({ success: true, data: memory });
  } catch (err) {
    console.error('getMemoryById error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to fetch memory',
    });
  }
};

/**
 * Update a memory. Only the owner can update.
 */
export const updateMemory = async (req, res) => {
  try {
    const userId = req.user._id;
    const { memoryId } = req.params;
    const { caption, memoryDate } = req.body;
    const fileList = req.files?.files || [];
    const files = Array.isArray(fileList) ? fileList : [];

    const memory = await Memory.findOne({ _id: memoryId, user: userId });
    if (!memory) {
      return res.status(404).json({ success: false, message: 'Memory not found' });
    }

    if (memoryDate != null) {
      const parsedDate = new Date(memoryDate);
      if (!Number.isNaN(parsedDate.getTime())) memory.memoryDate = parsedDate;
    }
    if (caption !== undefined) memory.caption = (caption || '').trim().slice(0, 500);

    if (files.length > 0) {
      const newUrls = [];
      for (const file of files) {
        if (!file.mimetype.startsWith('image/')) continue;
        try {
          const result = await cloudinary.uploader.upload(file.path, {
            folder: 'chat-app/memories',
            resource_type: 'image',
          });
          newUrls.push(result.secure_url);
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        } catch (e) {
          console.error('Error uploading memory image:', e);
        }
      }
      if (newUrls.length) memory.images = [...memory.images, ...newUrls];
    }

    await memory.save();

    return res.json({ success: true, data: memory });
  } catch (err) {
    console.error('updateMemory error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to update memory',
    });
  }
};

/**
 * Delete a memory. Only the owner can delete.
 */
export const deleteMemory = async (req, res) => {
  try {
    const userId = req.user._id;
    const { memoryId } = req.params;
    const memory = await Memory.findOneAndDelete({ _id: memoryId, user: userId });
    if (!memory) {
      return res.status(404).json({ success: false, message: 'Memory not found' });
    }
    return res.json({ success: true, message: 'Memory deleted' });
  } catch (err) {
    console.error('deleteMemory error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to delete memory',
    });
  }
};
