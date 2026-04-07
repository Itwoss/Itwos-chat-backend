import mongoose from 'mongoose';
import ProfileLike from '../models/ProfileLike.js';

export async function listAdminProfileLikes(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.date && typeof req.query.date === 'string') {
      filter.date = req.query.date.trim();
    }
    if (req.query.profileUserId && mongoose.isValidObjectId(req.query.profileUserId)) {
      filter.profileUserId = req.query.profileUserId;
    }
    if (req.query.likedByUserId && mongoose.isValidObjectId(req.query.likedByUserId)) {
      filter.likedByUserId = req.query.likedByUserId;
    }

    const [items, total] = await Promise.all([
      ProfileLike.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('profileUserId', 'name email profileImage')
        .populate('likedByUserId', 'name email profileImage')
        .lean(),
      ProfileLike.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data: items,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    });
  } catch (err) {
    console.error('[listAdminProfileLikes]', err);
    return res.status(500).json({ success: false, message: err.message || 'Server error' });
  }
}

export async function deleteAdminProfileLike(req, res) {
  try {
    const id = req.params.id;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid id' });
    }
    const doc = await ProfileLike.findByIdAndDelete(id).lean();
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Like not found' });
    }
    const totalLikes = await ProfileLike.countDocuments({ profileUserId: doc.profileUserId });
    const io = req.app.get('io');
    const pid = doc.profileUserId.toString();
    if (io) {
      io.to(`profile_${pid}`).emit('like_update', {
        profileId: pid,
        totalLikes,
      });
    }
    return res.json({ success: true, message: 'Deleted', totalLikes, profileUserId: pid });
  } catch (err) {
    console.error('[deleteAdminProfileLike]', err);
    return res.status(500).json({ success: false, message: err.message || 'Server error' });
  }
}

/** Totals per profile + optional per-day breakdown */
export async function getAdminProfileLikeStats(req, res) {
  try {
    const date = req.query.date && typeof req.query.date === 'string' ? req.query.date.trim() : null;

    const perProfile = await ProfileLike.aggregate([
      ...(date ? [{ $match: { date } }] : []),
      { $group: { _id: '$profileUserId', total: { $sum: 1 } } },
      { $sort: { total: -1 } },
      { $limit: 50 },
    ]);

    const profileIds = perProfile.map((p) => p._id).filter(Boolean);
    const User = (await import('../models/User.js')).default;
    const users = await User.find({ _id: { $in: profileIds } })
      .select('name email')
      .lean();
    const nameById = Object.fromEntries(users.map((u) => [u._id.toString(), u]));

    const withNames = perProfile.map((row) => ({
      profileUserId: row._id,
      total: row.total,
      user: nameById[row._id.toString()] || null,
    }));

    const likesPerDay = await ProfileLike.aggregate([
      { $group: { _id: '$date', count: { $sum: 1 } } },
      { $sort: { _id: -1 } },
      { $limit: 30 },
    ]);

    return res.json({
      success: true,
      data: {
        perProfile: withNames,
        likesPerDay,
        filterDate: date,
      },
    });
  } catch (err) {
    console.error('[getAdminProfileLikeStats]', err);
    return res.status(500).json({ success: false, message: err.message || 'Server error' });
  }
}
