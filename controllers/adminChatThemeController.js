import ChatTheme from '../models/ChatTheme.js';
import fs from 'fs';
import mongoose from 'mongoose';

const cloudinary = (await import('../utils/cloudinary.js')).default;

export const getAllChatThemes = async (req, res) => {
  try {
    const { isActive, isFree, page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const query = {};
    if (isActive !== undefined) query.isActive = isActive === 'true';
    if (isFree !== undefined) query.isFree = isFree === 'true';

    const themes = await ChatTheme.find(query)
      .sort({ sortOrder: 1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();
    const total = await ChatTheme.countDocuments(query);

    res.status(200).json({
      success: true,
      data: themes,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch chat themes', error: error.message });
  }
};

export const getChatThemeById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid theme ID' });
    }
    const theme = await ChatTheme.findById(id).lean();
    if (!theme) return res.status(404).json({ success: false, message: 'Chat theme not found' });
    res.status(200).json({ success: true, data: theme });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch theme', error: error.message });
  }
};

const uploadImage = async (file, folder) => {
  if (!file || !file.path) return null;
  const result = await cloudinary.uploader.upload(file.path, { folder, resource_type: 'image' });
  if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
  return result.secure_url;
};

export const createChatTheme = async (req, res) => {
  try {
    const { name, description, isFree, price, sortOrder, isActive, outgoingBubbleColor, incomingBubbleColor, outgoingBubbleTextColor, incomingBubbleTextColor, backgroundColor } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: 'Theme name is required' });
    }

    let wallpaper = null;
    let thumbnail = (req.body.thumbnail && String(req.body.thumbnail).trim()) || null;
    if (req.file) {
      wallpaper = await uploadImage(req.file, 'chat-app/chat-themes');
    }
    if (!thumbnail) thumbnail = wallpaper;

    const free = isFree !== undefined ? isFree === 'true' || isFree === true : true;
    const theme = await ChatTheme.create({
      name: name.trim(),
      description: (description || '').trim(),
      wallpaper,
      thumbnail: thumbnail || wallpaper,
      isFree: free,
      price: free ? 0 : Math.max(0, parseFloat(price) || 0),
      sortOrder: parseInt(sortOrder) || 0,
      isActive: isActive !== undefined ? isActive === 'true' : true,
      outgoingBubbleColor: outgoingBubbleColor || null,
      incomingBubbleColor: incomingBubbleColor || null,
      outgoingBubbleTextColor: outgoingBubbleTextColor || null,
      incomingBubbleTextColor: incomingBubbleTextColor || null,
      backgroundColor: backgroundColor || null,
    });

    res.status(201).json({ success: true, message: 'Chat theme created', data: theme });
  } catch (error) {
    if (req.file && req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ success: false, message: 'Failed to create theme', error: error.message });
  }
};

export const updateChatTheme = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, isFree, price, sortOrder, isActive, outgoingBubbleColor, incomingBubbleColor, outgoingBubbleTextColor, incomingBubbleTextColor, backgroundColor } = req.body;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid theme ID' });
    }

    const theme = await ChatTheme.findById(id);
    if (!theme) return res.status(404).json({ success: false, message: 'Chat theme not found' });

    let wallpaper = req.body.wallpaper ? String(req.body.wallpaper).trim() : undefined;
    let thumbnail = req.body.thumbnail ? String(req.body.thumbnail).trim() : undefined;
    if (req.file) {
      wallpaper = await uploadImage(req.file, 'chat-app/chat-themes');
    }

    if (name !== undefined) theme.name = name.trim();
    if (description !== undefined) theme.description = description.trim();
    if (wallpaper) theme.wallpaper = wallpaper;
    if (thumbnail !== undefined) theme.thumbnail = thumbnail || theme.wallpaper;
    if (isFree !== undefined) {
      theme.isFree = isFree === 'true' || isFree === true;
      if (theme.isFree) theme.price = 0;
    }
    if (price !== undefined && !theme.isFree) theme.price = Math.max(0, parseFloat(price) || 0);
    if (sortOrder !== undefined) theme.sortOrder = parseInt(sortOrder) || 0;
    if (isActive !== undefined) theme.isActive = isActive === 'true';
    if (outgoingBubbleColor !== undefined) theme.outgoingBubbleColor = outgoingBubbleColor || null;
    if (incomingBubbleColor !== undefined) theme.incomingBubbleColor = incomingBubbleColor || null;
    if (outgoingBubbleTextColor !== undefined) theme.outgoingBubbleTextColor = outgoingBubbleTextColor || null;
    if (incomingBubbleTextColor !== undefined) theme.incomingBubbleTextColor = incomingBubbleTextColor || null;
    if (backgroundColor !== undefined) theme.backgroundColor = backgroundColor || null;

    await theme.save();
    res.status(200).json({ success: true, message: 'Chat theme updated', data: theme });
  } catch (error) {
    if (req.file && req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ success: false, message: 'Failed to update theme', error: error.message });
  }
};

export const deleteChatTheme = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid theme ID' });
    }
    const theme = await ChatTheme.findByIdAndDelete(id);
    if (!theme) return res.status(404).json({ success: false, message: 'Chat theme not found' });
    res.status(200).json({ success: true, message: 'Chat theme deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete theme', error: error.message });
  }
};
