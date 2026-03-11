import Banner from '../models/Banner.js';
import User from '../models/User.js';
import BannerPayment from '../models/BannerPayment.js';
import mongoose from 'mongoose';
import { createOrder as createRazorpayOrder, verifyPaymentSignature, getPaymentDetails } from '../utils/razorpay.js';
import { createNotification } from './notificationController.js';
import { createAdminNotification } from './notificationController.js';

/** Global ownership check: user owns banner ONLY if verified BannerPayment exists. Do not trust user.bannerInventory. */
const VERIFIED_STATUSES = ['verified', 'completed'];
const hasVerifiedBannerPayment = async (userId, bannerId) => {
  if (!userId || !bannerId) return false;
  const exists = await BannerPayment.exists({
    user: userId,
    banner: bannerId,
    paymentStatus: { $in: VERIFIED_STATUSES }
  });
  return !!exists;
};

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

// Get user's equipped banner (public) – only return if banner has verified payment
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

    let equippedBanner = user.equippedBanner || null;
    if (equippedBanner) {
      const paid = await hasVerifiedBannerPayment(userId, equippedBanner._id || equippedBanner);
      if (!paid) {
        equippedBanner = null;
        await User.findByIdAndUpdate(userId, { equippedBanner: null });
      }
    }

    res.status(200).json({
      success: true,
      data: {
        equippedBanner
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

// Get user's inventory (authenticated) – only banners with a verified payment (BannerPayment)
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

    const paidBannerIds = await BannerPayment.find({ user: userId, paymentStatus: { $in: VERIFIED_STATUSES } })
      .distinct('banner')
      .then(ids => ids.map(id => id.toString()));

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

    const inventory = (user.bannerInventory || []).filter(
      b => b && paidBannerIds.includes((b._id || b).toString())
    );
    const equippedId = user.equippedBanner ? (user.equippedBanner._id || user.equippedBanner).toString() : null;
    const equippedBanner = equippedId && paidBannerIds.includes(equippedId) ? user.equippedBanner : null;

    if (inventory.length !== (user.bannerInventory || []).length || (user.equippedBanner && !equippedBanner)) {
      await User.findByIdAndUpdate(userId, {
        bannerInventory: inventory.map(b => b._id || b),
        equippedBanner: equippedBanner ? (equippedBanner._id || equippedBanner) : null
      });
    }

    res.status(200).json({
      success: true,
      data: {
        inventory,
        equippedBanner
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

// Create Razorpay order for banner purchase
export const createBannerOrder = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { bannerId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(bannerId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid banner ID'
      });
    }

    const banner = await Banner.findById(bannerId);
    if (!banner) {
      return res.status(404).json({
        success: false,
        message: 'Banner not found'
      });
    }
    if (!banner.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Banner is not available for purchase'
      });
    }
    if (banner.stock !== -1 && banner.stock <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Banner is out of stock'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    const alreadyOwns = await hasVerifiedBannerPayment(userId, bannerId);
    if (alreadyOwns) {
      return res.status(400).json({
        success: false,
        message: 'You already own this banner'
      });
    }

    const amount = Number(banner.price);
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid banner price'
      });
    }

    const receipt = `banner_${userId.toString().slice(-8)}_${Date.now().toString().slice(-10)}`.substring(0, 40);
    const order = await createRazorpayOrder(amount, 'INR', receipt);

    res.status(200).json({
      success: true,
      data: {
        orderId: order.id,
        amount,
        currency: 'INR',
        key: process.env.RAZORPAY_KEY_ID
      }
    });
  } catch (error) {
    console.error('Error creating banner order:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating order',
      error: error.message
    });
  }
};

// Verify Razorpay payment and complete banner purchase (only after real payment; no fake success)
export const verifyBannerPayment = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { orderId, paymentId, signature, bannerId } = req.body;

    if (!orderId || !paymentId || !signature || !bannerId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    const isValid = verifyPaymentSignature(orderId, paymentId, signature);
    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment signature'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(bannerId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid banner ID'
      });
    }

    const banner = await Banner.findById(bannerId);
    if (!banner) {
      return res.status(404).json({
        success: false,
        message: 'Banner not found'
      });
    }
    if (!banner.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Banner is not available'
      });
    }
    if (banner.stock !== -1 && banner.stock <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Banner is out of stock'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const amount = Number(banner.price) || 0;

    const existingBannerPayment = await BannerPayment.findOne({ razorpayPaymentId: paymentId });
    if (existingBannerPayment) {
      const updated = await User.findById(userId)
        .populate('bannerInventory', 'name imageUrl price rarity effect category description')
        .populate('equippedBanner', 'name imageUrl rarity effect')
        .select('bannerInventory equippedBanner')
        .lean();
      return res.status(200).json({
        success: true,
        message: 'Payment already processed',
        data: {
          inventory: updated.bannerInventory || [],
          equippedBanner: updated.equippedBanner || null
        }
      });
    }

    const paymentDetails = await getPaymentDetails(paymentId);
    const status = paymentDetails?.status;
    if (status !== 'captured' && status !== 'authorized') {
      return res.status(400).json({
        success: false,
        message: 'Payment not completed. Status: ' + (status || 'unknown')
      });
    }

    const bannerPaymentRecord = await BannerPayment.create({
      user: userId,
      banner: bannerId,
      amount,
      currency: 'INR',
      orderId,
      razorpayPaymentId: paymentId,
      paymentStatus: 'verified',
      paymentDetails: paymentDetails || {}
    });

    if (!user.bannerInventory) user.bannerInventory = [];
    if (!user.bannerInventory.some(b => b.toString() === bannerId)) {
      user.bannerInventory.push(bannerId);
      if (!user.equippedBanner) user.equippedBanner = bannerId;
      await user.save();
    }

    if (banner.stock !== -1) {
      banner.stock -= 1;
    }
    banner.purchaseCount += 1;
    await banner.save();

    const userName = user.name || user.username || 'A user';
    await createNotification(
      userId,
      'banner_purchase',
      'Banner purchased',
      `You purchased "${banner.name}" for ₹${amount}. It has been added to your inventory.`,
      null,
      null,
      '/user/banner-inventory'
    );
    try {
      await createAdminNotification(
        'message',
        'New banner purchase',
        `${userName} purchased banner "${banner.name}" for ₹${amount}. Payment ID: ${paymentId}`,
        null,
        null,
        '/admin/banners'
      );
    } catch (e) {
      console.error('Admin notification failed:', e);
    }

    const updatedUser = await User.findById(userId)
      .populate('bannerInventory', 'name imageUrl price rarity effect category description')
      .populate('equippedBanner', 'name imageUrl rarity effect')
      .select('bannerInventory equippedBanner')
      .lean();

    return res.status(200).json({
      success: true,
      message: 'Banner purchased successfully',
      data: {
        inventory: updatedUser.bannerInventory || [],
        equippedBanner: updatedUser.equippedBanner || null,
        payment: {
          id: bannerPaymentRecord._id,
          amount,
          razorpayPaymentId: paymentId,
          paymentDate: bannerPaymentRecord.paymentDate
        }
      }
    });
  } catch (error) {
    console.error('Error verifying banner payment:', error);
    res.status(500).json({
      success: false,
      message: 'Error completing purchase',
      error: error.message
    });
  }
};

// Direct purchase disabled – banners require payment via Razorpay (Pay button)
export const purchaseBanner = async (req, res) => {
  res.status(403).json({
    success: false,
    code: 'BANNER_PAYMENT_REQUIRED',
    message: 'Banner purchase requires payment. Go to Banner Store, click Pay on the banner you want, and complete payment via Razorpay.'
  });
};

/** Claim a free banner (price === 0). No payment; adds to inventory with a verified BannerPayment record. */
export const claimFreeBanner = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { bannerId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(bannerId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid banner ID'
      });
    }

    const banner = await Banner.findById(bannerId);
    if (!banner) {
      return res.status(404).json({
        success: false,
        message: 'Banner not found'
      });
    }
    if (!banner.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Banner is not available'
      });
    }
    const price = Number(banner.price);
    if (price != null && price !== 0) {
      return res.status(400).json({
        success: false,
        message: 'This banner is not free. Use Pay to purchase.'
      });
    }
    if (banner.stock !== -1 && banner.stock <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Banner is out of stock'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const alreadyOwns = await hasVerifiedBannerPayment(userId, bannerId);
    if (alreadyOwns) {
      return res.status(400).json({
        success: false,
        message: 'You already have this banner'
      });
    }

    const uniqueId = `free_${userId}_${bannerId}_${Date.now()}`;
    await BannerPayment.create({
      user: userId,
      banner: bannerId,
      amount: 0,
      currency: 'INR',
      orderId: uniqueId,
      razorpayPaymentId: uniqueId,
      paymentStatus: 'verified',
      paymentDetails: { free: true }
    });

    if (!user.bannerInventory) user.bannerInventory = [];
    if (!user.bannerInventory.some(b => b.toString() === bannerId)) {
      user.bannerInventory.push(bannerId);
      if (!user.equippedBanner) user.equippedBanner = bannerId;
      await user.save();
    }

    if (banner.stock !== -1) {
      banner.stock -= 1;
    }
    banner.purchaseCount += 1;
    await banner.save();

    const updatedUser = await User.findById(userId)
      .populate('bannerInventory', 'name imageUrl price rarity effect category description')
      .populate('equippedBanner', 'name imageUrl rarity effect')
      .select('bannerInventory equippedBanner')
      .lean();

    return res.status(200).json({
      success: true,
      message: 'Banner added to your inventory',
      data: {
        inventory: updatedUser.bannerInventory || [],
        equippedBanner: updatedUser.equippedBanner || null
      }
    });
  }
  catch (error) {
    console.error('[Banner Controller] claimFreeBanner error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to claim banner',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
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

    const hasPaid = await hasVerifiedBannerPayment(userId, id);
    if (!hasPaid) {
      return res.status(400).json({
        success: false,
        message: 'You do not own this banner. Ownership requires a verified payment.'
      });
    }

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

// Get my banner payment history (authenticated)
export const getMyBannerPayments = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const payments = await BannerPayment.find({ user: userId })
      .populate('banner', 'name imageUrl price rarity')
      .sort({ paymentDate: -1 })
      .lean();
    res.status(200).json({
      success: true,
      data: payments
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching payment history',
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

