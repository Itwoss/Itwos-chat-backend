import mongoose from 'mongoose';
import Font from '../models/Font.js';
import User from '../models/User.js';

export const getAllFontsAdmin = async (req, res) => {
  try {
    const fonts = await Font.find({}).sort({ createdAt: -1 }).lean();
    res.status(200).json({ success: true, data: fonts });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch fonts', error: error.message });
  }
};

export const getFontByIdAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid font ID' });
    }
    const font = await Font.findById(id).lean();
    if (!font) return res.status(404).json({ success: false, message: 'Font not found' });
    res.status(200).json({ success: true, data: font });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch font', error: error.message });
  }
};

export const createFont = async (req, res) => {
  try {
    const body = req.body || {};
    const name = (body.name || '').trim();
    const fontFamily = (body.fontFamily || '').trim();
    if (!name) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }
    if (!fontFamily) {
      return res.status(400).json({ success: false, message: 'fontFamily is required' });
    }

    const price = Math.max(0, parseFloat(body.price) || 0);
    const category = body.category === 'premium' ? 'premium' : 'free';

    const font = await Font.create({
      name,
      fontFamily,
      fileUrl: (body.fileUrl || '').trim(),
      previewUrl: (body.previewUrl || '').trim(),
      googleFontsCssUrl: (body.googleFontsCssUrl || '').trim(),
      googleFont: Boolean(body.googleFont),
      fontSource: (body.fontSource || '').trim(),
      price,
      category,
      fontType: (body.fontType || 'modern_sans').trim(),
      description: (body.description || '').trim(),
      cssStyles: typeof body.cssStyles === 'string' ? body.cssStyles : JSON.stringify(body.cssStyles || {}),
      isActive: body.isActive !== false && body.isActive !== 'false',
      isDefault: Boolean(body.isDefault),
    });

    res.status(201).json({ success: true, message: 'Font created', data: font });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create font', error: error.message });
  }
};

export const updateFont = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid font ID' });
    }
    const font = await Font.findById(id);
    if (!font) return res.status(404).json({ success: false, message: 'Font not found' });

    const body = req.body || {};
    if (body.name != null) font.name = String(body.name).trim();
    if (body.fontFamily != null) font.fontFamily = String(body.fontFamily).trim();
    if (body.fileUrl != null) font.fileUrl = String(body.fileUrl).trim();
    if (body.previewUrl != null) font.previewUrl = String(body.previewUrl).trim();
    if (body.googleFontsCssUrl != null) font.googleFontsCssUrl = String(body.googleFontsCssUrl).trim();
    if (body.googleFont != null) font.googleFont = Boolean(body.googleFont);
    if (body.fontSource != null) font.fontSource = String(body.fontSource).trim();
    if (body.price != null) font.price = Math.max(0, parseFloat(body.price) || 0);
    if (body.category != null) font.category = body.category === 'premium' ? 'premium' : 'free';
    if (body.fontType != null) font.fontType = String(body.fontType).trim();
    if (body.description != null) font.description = String(body.description).trim();
    if (body.cssStyles != null) {
      font.cssStyles =
        typeof body.cssStyles === 'string' ? body.cssStyles : JSON.stringify(body.cssStyles || {});
    }
    if (body.isActive != null) font.isActive = body.isActive !== false && body.isActive !== 'false';
    if (body.isDefault != null) font.isDefault = Boolean(body.isDefault);

    await font.save();
    res.status(200).json({ success: true, message: 'Font updated', data: font });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update font', error: error.message });
  }
};

export const deleteFont = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid font ID' });
    }
    const font = await Font.findByIdAndDelete(id);
    if (!font) return res.status(404).json({ success: false, message: 'Font not found' });

    const fid = font._id;
    await User.updateMany({ fontInventory: fid }, { $pull: { fontInventory: fid } });
    await User.updateMany({ equippedFont: fid }, { $set: { equippedFont: null } });

    res.status(200).json({ success: true, message: 'Font deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete font', error: error.message });
  }
};
