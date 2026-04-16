import mongoose from 'mongoose';
import Font from '../models/Font.js';
import User from '../models/User.js';

const FONT_PUBLIC_FIELDS =
  'name fontFamily fileUrl previewUrl googleFontsCssUrl googleFont fontSource cssStyles fontType category price description isDefault isActive purchaseCount createdAt';

export const getAllFonts = async (req, res) => {
  try {
    const { category, fontType, search } = req.query;
    const query = { isActive: true };
    if (category) query.category = category;
    if (fontType) query.fontType = fontType;

    let fonts = await Font.find(query).select(FONT_PUBLIC_FIELDS).sort({ createdAt: -1 }).lean();

    if (search && String(search).trim()) {
      const q = String(search).trim().toLowerCase();
      fonts = fonts.filter(
        (f) =>
          (f.name && f.name.toLowerCase().includes(q)) ||
          (f.description && f.description.toLowerCase().includes(q)) ||
          (f.fontFamily && f.fontFamily.toLowerCase().includes(q))
      );
    }

    res.status(200).json({ success: true, data: fonts });
  } catch (error) {
    console.error('[Font Controller] getAllFonts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch fonts',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

export const getFontById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid font ID' });
    }
    const font = await Font.findOne({ _id: id, isActive: true }).select(FONT_PUBLIC_FIELDS).lean();
    if (!font) {
      return res.status(404).json({ success: false, message: 'Font not found' });
    }
    res.status(200).json({ success: true, data: font });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch font', error: error.message });
  }
};

export const getUserFontInventory = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    const userId = req.user._id;
    const user = await User.findById(userId)
      .populate('fontInventory', FONT_PUBLIC_FIELDS)
      .populate('equippedFont', FONT_PUBLIC_FIELDS)
      .select('fontInventory equippedFont')
      .lean();

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const inventory = (user.fontInventory || []).filter(Boolean);
    const equippedFont = user.equippedFont || null;

    res.status(200).json({
      success: true,
      data: {
        inventory,
        equippedFont,
      },
    });
  } catch (error) {
    console.error('[Font Controller] getUserFontInventory:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch font inventory', error: error.message });
  }
};

export const purchaseFont = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid font ID' });
    }

    const font = await Font.findById(id);
    if (!font || !font.isActive) {
      return res.status(404).json({ success: false, message: 'Font not found' });
    }

    if (font.price > 0) {
      return res.status(400).json({
        success: false,
        message: 'Premium font purchase is not enabled yet. Only free fonts are available.',
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const fontIdStr = font._id.toString();
    const has = (user.fontInventory || []).some((fid) => fid.toString() === fontIdStr);
    if (!has) {
      user.fontInventory = [...(user.fontInventory || []), font._id];
      await user.save();
      font.purchaseCount = (font.purchaseCount || 0) + 1;
      await font.save();
    }

    res.status(200).json({ success: true, message: 'Font added to your inventory', data: { fontId: font._id } });
  } catch (error) {
    console.error('[Font Controller] purchaseFont:', error);
    res.status(500).json({ success: false, message: 'Failed to purchase font', error: error.message });
  }
};

export const equipFont = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid font ID' });
    }

    const font = await Font.findOne({ _id: id, isActive: true });
    if (!font) {
      return res.status(404).json({ success: false, message: 'Font not found' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const fontIdStr = font._id.toString();
    const owns = (user.fontInventory || []).some((fid) => fid.toString() === fontIdStr);
    if (!owns) {
      return res.status(403).json({ success: false, message: 'You do not own this font. Get it free first.' });
    }

    user.equippedFont = font._id;
    await user.save();

    const populated = await User.findById(user._id)
      .populate('equippedFont', FONT_PUBLIC_FIELDS)
      .select('equippedFont')
      .lean();

    res.status(200).json({
      success: true,
      message: 'Font equipped',
      data: { equippedFont: populated.equippedFont },
    });
  } catch (error) {
    console.error('[Font Controller] equipFont:', error);
    res.status(500).json({ success: false, message: 'Failed to equip font', error: error.message });
  }
};

export const unequipFont = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    await User.findByIdAndUpdate(req.user._id, { equippedFont: null });
    res.status(200).json({ success: true, message: 'Font unequipped' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to unequip font', error: error.message });
  }
};
