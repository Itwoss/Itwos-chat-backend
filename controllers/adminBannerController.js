import Banner from '../models/Banner.js';
import BannerPayment from '../models/BannerPayment.js';
import User from '../models/User.js';
import cloudinary from '../utils/cloudinary.js';
import fs from 'fs';
import mongoose from 'mongoose';

// Get all banners (admin) with pagination
export const getAllBannersAdmin = async (req, res) => {
  try {
    const { category, rarity, isActive, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = {};

    if (category) {
      query.category = category;
    }

    if (rarity) {
      query.rarity = rarity;
    }

    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    const banners = await Banner.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Banner.countDocuments(query);

    res.status(200).json({
      success: true,
      data: banners,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching banners',
      error: error.message
    });
  }
};

// Get banner by ID (admin)
export const getBannerByIdAdmin = async (req, res) => {
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

// Create banner (admin)
export const createBanner = async (req, res) => {
  try {
    const { name, price, rarity, effect, category, stock, isActive, description } = req.body;
    let imageUrl = req.body.imageUrl;

    // Validate required fields
    if (!name || !price || !rarity || !effect || !category) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: name, price, rarity, effect, category'
      });
    }

    // Handle image upload
    if (req.file) {
      try {
        const result = await cloudinary.uploader.upload(req.file.path, {
          folder: 'chat-app/banners',
          resource_type: 'image'
        });
        imageUrl = result.secure_url;

        // Delete local file
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
      } catch (uploadError) {
        console.error('Cloudinary upload error:', uploadError);
        return res.status(500).json({
          success: false,
          message: 'Error uploading image',
          error: uploadError.message
        });
      }
    }

    if (!imageUrl) {
      return res.status(400).json({
        success: false,
        message: 'Image URL or file is required'
      });
    }

    // Create banner
    const banner = await Banner.create({
      name,
      imageUrl,
      price: parseFloat(price),
      rarity,
      effect,
      category,
      stock: stock !== undefined ? parseInt(stock) : -1,
      isActive: isActive !== undefined ? isActive === 'true' : true,
      description: description || '',
      purchaseCount: 0
    });

    res.status(201).json({
      success: true,
      message: 'Banner created successfully',
      data: banner
    });
  } catch (error) {
    // Clean up uploaded file if error occurred
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      success: false,
      message: 'Error creating banner',
      error: error.message
    });
  }
};

// Update banner (admin)
export const updateBanner = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, price, rarity, effect, category, stock, isActive, description } = req.body;
    let imageUrl = req.body.imageUrl;

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

    // Handle new image upload
    if (req.file) {
      try {
        // Delete old image from Cloudinary if exists
        if (banner.imageUrl) {
          try {
            // Extract public_id from Cloudinary URL
            const urlParts = banner.imageUrl.split('/');
            const filename = urlParts[urlParts.length - 1];
            const publicId = `chat-app/banners/${filename.split('.')[0]}`;
            await cloudinary.uploader.destroy(publicId);
          } catch (deleteError) {
            console.error('Error deleting old image:', deleteError);
            // Continue even if deletion fails
          }
        }

        // Upload new image
        const result = await cloudinary.uploader.upload(req.file.path, {
          folder: 'chat-app/banners',
          resource_type: 'image'
        });
        imageUrl = result.secure_url;

        // Delete local file
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
      } catch (uploadError) {
        console.error('Cloudinary upload error:', uploadError);
        return res.status(500).json({
          success: false,
          message: 'Error uploading image',
          error: uploadError.message
        });
      }
    }

    // Update banner fields
    if (name) banner.name = name;
    if (price !== undefined) banner.price = parseFloat(price);
    if (rarity) banner.rarity = rarity;
    if (effect) banner.effect = effect;
    if (category) banner.category = category;
    if (stock !== undefined) banner.stock = parseInt(stock);
    if (isActive !== undefined) banner.isActive = isActive === 'true';
    if (description !== undefined) banner.description = description;
    if (imageUrl) banner.imageUrl = imageUrl;

    await banner.save();

    res.status(200).json({
      success: true,
      message: 'Banner updated successfully',
      data: banner
    });
  } catch (error) {
    // Clean up uploaded file if error occurred
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      success: false,
      message: 'Error updating banner',
      error: error.message
    });
  }
};

// Delete banner (admin)
export const deleteBanner = async (req, res) => {
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

    // Delete image from Cloudinary
    if (banner.imageUrl) {
      try {
        const urlParts = banner.imageUrl.split('/');
        const filename = urlParts[urlParts.length - 1];
        const publicId = `chat-app/banners/${filename.split('.')[0]}`;
        await cloudinary.uploader.destroy(publicId);
      } catch (deleteError) {
        console.error('Error deleting image from Cloudinary:', deleteError);
        // Continue even if deletion fails
      }
    }

    // Remove banner from all users' inventory and unequip it
    await User.updateMany(
      { bannerInventory: id },
      { $pull: { bannerInventory: id } }
    );

    await User.updateMany(
      { equippedBanner: id },
      { $set: { equippedBanner: null } }
    );

    // Delete banner
    await Banner.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Banner deleted successfully. Removed from all users.'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting banner',
      error: error.message
    });
  }
};

// Get banner statistics (admin)
export const getBannerStats = async (req, res) => {
  try {
    const [
      totalBanners,
      activeBanners,
      totalPurchases,
      rarityStats,
      categoryStats,
      topBanners
    ] = await Promise.all([
      Banner.countDocuments(),
      Banner.countDocuments({ isActive: true }),
      Banner.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: '$purchaseCount' }
          }
        }
      ]),
      Banner.aggregate([
        {
          $group: {
            _id: '$rarity',
            count: { $sum: 1 },
            totalPurchases: { $sum: '$purchaseCount' }
          }
        },
        { $sort: { count: -1 } }
      ]),
      Banner.aggregate([
        {
          $group: {
            _id: '$category',
            count: { $sum: 1 },
            totalPurchases: { $sum: '$purchaseCount' }
          }
        },
        { $sort: { count: -1 } }
      ]),
      Banner.find()
        .sort({ purchaseCount: -1 })
        .limit(10)
        .select('name purchaseCount rarity price')
        .lean()
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalBanners,
        activeBanners,
        totalPurchases: totalPurchases[0]?.total || 0,
        rarityStats,
        categoryStats,
        topBanners
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching banner statistics',
      error: error.message
    });
  }
};

// Get all banner payments (admin)
export const getBannerPaymentsAdmin = async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const payments = await BannerPayment.find()
      .populate('user', 'name username email')
      .populate('banner', 'name imageUrl price rarity')
      .sort({ paymentDate: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();
    const total = await BannerPayment.countDocuments();
    res.status(200).json({
      success: true,
      data: payments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching banner payments',
      error: error.message
    });
  }
};

// Sync all users' banner inventory to only include banners with a verified payment (removes unpaid/fake)
export const syncBannerInventoryAdmin = async (req, res) => {
  try {
    const users = await User.find({
      $or: [
        { bannerInventory: { $exists: true, $ne: [] } },
        { equippedBanner: { $exists: true, $ne: null } }
      ]
    }).select('_id bannerInventory equippedBanner');

    let updated = 0;
    let removed = 0;

    for (const user of users) {
      const paidBannerIds = await BannerPayment.find({
        user: user._id,
        paymentStatus: { $in: ['verified', 'completed'] }
      }).distinct('banner');
      const paidSet = new Set(paidBannerIds.map(id => id.toString()));
      const current = (user.bannerInventory || []).map(id => id.toString());
      const validInventory = current.filter(id => paidSet.has(id));
      const equippedId = user.equippedBanner ? user.equippedBanner.toString() : null;
      const validEquipped = equippedId && paidSet.has(equippedId) ? user.equippedBanner : null;

      if (validInventory.length !== current.length || (equippedId && !validEquipped)) {
        await User.findByIdAndUpdate(user._id, {
          bannerInventory: validInventory.map(id => new mongoose.Types.ObjectId(id)),
          equippedBanner: validEquipped ? new mongoose.Types.ObjectId(validEquipped) : null
        });
        updated += 1;
        removed += current.length - validInventory.length + (equippedId && !validEquipped ? 1 : 0);
      }
    }

    res.status(200).json({
      success: true,
      message: 'Banner inventory synced to payments. Only verified payments count.',
      usersUpdated: updated,
      unpaidBannersRemoved: removed,
      data: { usersChecked: users.length, usersUpdated: updated, unpaidBannersRemoved: removed }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error syncing banner inventory',
      error: error.message
    });
  }
};



