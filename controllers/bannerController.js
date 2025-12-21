import Banner from '../models/Banner.js';
import User from '../models/User.js';
import mongoose from 'mongoose';

// Get all active banners (public)
export const getAllBanners = async (req, res) => {
  try {
    const { category, rarity, minPrice, maxPrice, effect } = req.query;

    const query = { isActive: true };

    if (category) {
      query.category = category;
    }

    if (rarity) {
      query.rarity = rarity;
    }

    if (effect) {
      query.effect = effect;
    }

    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = parseFloat(minPrice);
      if (maxPrice) query.price.$lte = parseFloat(maxPrice);
    }

    const banners = await Banner.find(query)
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      data: banners
    });
  } catch (error) {
    console.error('[Banner Controller] Error fetching banners:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching banners',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Get banner by ID (public)
export const getBannerById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid banner ID'
      });
    }

    const banner = await Banner.findById(id);

    if (!banner) {
      return res.status(404).json({
        success: false,
        message: 'Banner not found'
      });
    }

    res.status(200).json({
      success: true,
      data: banner
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching banner',
      error: error.message
    });
  }
};

// Get user's equipped banner (public)
export const getUserEquippedBanner = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    const user = await User.findById(userId)
      .populate('equippedBanner', 'name imageUrl rarity effect')
      .select('equippedBanner')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        equippedBanner: user.equippedBanner || null
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching equipped banner',
      error: error.message
    });
  }
};

// Get user's inventory (authenticated)
export const getUserInventory = async (req, res) => {
  try {
    if (!req.user) {
      console.error('[Banner Controller] No user in request');
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const userId = req.user._id || req.user.id;
    console.log('[Banner Controller] Fetching inventory for user:', userId);

    const user = await User.findById(userId)
      .populate('bannerInventory', 'name imageUrl price rarity effect category description')
      .populate('equippedBanner', 'name imageUrl rarity effect')
      .select('bannerInventory equippedBanner')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        inventory: user.bannerInventory || [],
        equippedBanner: user.equippedBanner || null
      }
    });
  } catch (error) {
    console.error('[Banner Controller] Error fetching inventory:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching inventory',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Purchase banner (authenticated)
export const purchaseBanner = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid banner ID'
      });
    }

    // Find banner
    const banner = await Banner.findById(id);

    if (!banner) {
      return res.status(404).json({
        success: false,
        message: 'Banner not found'
      });
    }

    // Check if banner is active
    if (!banner.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Banner is not available for purchase'
      });
    }

    // Check stock availability
    if (banner.stock !== -1 && banner.stock <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Banner is out of stock'
      });
    }

    // Find user
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user already owns the banner
    if (user.bannerInventory && user.bannerInventory.includes(id)) {
      return res.status(400).json({
        success: false,
        message: 'You already own this banner'
      });
    }

    // Add banner to inventory
    if (!user.bannerInventory) {
      user.bannerInventory = [];
    }
    user.bannerInventory.push(id);

    // Auto-equip if user has no equipped banner
    if (!user.equippedBanner) {
      user.equippedBanner = id;
    }

    await user.save();

    // Update banner stock and purchase count
    if (banner.stock !== -1) {
      banner.stock -= 1;
    }
    banner.purchaseCount += 1;
    await banner.save();

    // Populate and return updated inventory
    const updatedUser = await User.findById(userId)
      .populate('bannerInventory', 'name imageUrl price rarity effect category description')
      .populate('equippedBanner', 'name imageUrl rarity effect')
      .select('bannerInventory equippedBanner')
      .lean();

    res.status(200).json({
      success: true,
      message: 'Banner purchased successfully',
      data: {
        inventory: updatedUser.bannerInventory || [],
        equippedBanner: updatedUser.equippedBanner || null
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error purchasing banner',
      error: error.message
    });
  }
};

// Equip banner (authenticated)
export const equipBanner = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid banner ID'
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user owns the banner
    if (!user.bannerInventory || !user.bannerInventory.includes(id)) {
      return res.status(400).json({
        success: false,
        message: 'You do not own this banner'
      });
    }

    // Equip the banner
    user.equippedBanner = id;
    await user.save();

    // Populate and return
    const updatedUser = await User.findById(userId)
      .populate('equippedBanner', 'name imageUrl rarity effect')
      .select('equippedBanner')
      .lean();

    res.status(200).json({
      success: true,
      message: 'Banner equipped successfully',
      data: {
        equippedBanner: updatedUser.equippedBanner
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error equipping banner',
      error: error.message
    });
  }
};

// Unequip banner (authenticated)
export const unequipBanner = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Unequip the banner
    user.equippedBanner = null;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Banner unequipped successfully',
      data: {
        equippedBanner: null
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error unequipping banner',
      error: error.message
    });
  }
};

