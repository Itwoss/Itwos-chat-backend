import mongoose from 'mongoose';
import ProfileLike from '../models/ProfileLike.js';
import User from '../models/User.js';
import { toYmd } from '../utils/dateYmd.js';

export async function postProfileLike(req, res) {
  try {
    const profileId = req.params.id;
    if (!mongoose.isValidObjectId(profileId)) {
      return res.status(400).json({ success: false, message: 'Invalid profile id' });
    }
    const target = await User.findById(profileId).select('_id').lean();
    if (!target) {
      return res.status(404).json({ success: false, message: 'Profile not found' });
    }
    const likedBy = req.user._id;
    const date = toYmd();
    try {
      await ProfileLike.create({
        profileUserId: profileId,
        likedByUserId: likedBy,
        date,
      });
    } catch (e) {
      if (e?.code === 11000) {
        return res.status(400).json({
          success: false,
          message: 'Already liked today',
          likedToday: true,
        });
      }
      throw e;
    }
    const totalLikes = await ProfileLike.countDocuments({ profileUserId: profileId });
    const io = req.app.get('io');
    if (io) {
      io.to(`profile_${profileId}`).emit('like_update', {
        profileId,
        totalLikes,
      });
    }
    return res.json({ success: true, totalLikes });
  } catch (err) {
    console.error('[postProfileLike]', err);
    return res.status(500).json({ success: false, message: err.message || 'Server error' });
  }
}

export async function deleteProfileLikeToday(req, res) {
  try {
    const profileId = req.params.id;
    if (!mongoose.isValidObjectId(profileId)) {
      return res.status(400).json({ success: false, message: 'Invalid profile id' });
    }
    const exists = await User.exists({ _id: profileId });
    if (!exists) {
      return res.status(404).json({ success: false, message: 'Profile not found' });
    }

    const likedBy = req.user._id;
    const date = toYmd();
    const del = await ProfileLike.deleteOne({
      profileUserId: profileId,
      likedByUserId: likedBy,
      date,
    });

    // If there was nothing to delete, treat as success (idempotent)
    const totalLikes = await ProfileLike.countDocuments({ profileUserId: profileId });
    const io = req.app.get('io');
    if (io) {
      io.to(`profile_${profileId}`).emit('like_update', {
        profileId,
        totalLikes,
      });
    }
    return res.json({ success: true, deleted: del?.deletedCount === 1, totalLikes });
  } catch (err) {
    console.error('[deleteProfileLikeToday]', err);
    return res.status(500).json({ success: false, message: err.message || 'Server error' });
  }
}

export async function getProfileTotalLikes(req, res) {
  try {
    const profileId = req.params.id;
    if (!mongoose.isValidObjectId(profileId)) {
      return res.status(400).json({ success: false, message: 'Invalid profile id' });
    }
    const exists = await User.exists({ _id: profileId });
    if (!exists) {
      return res.status(404).json({ success: false, message: 'Profile not found' });
    }
    const totalLikes = await ProfileLike.countDocuments({ profileUserId: profileId });
    return res.json({ success: true, totalLikes });
  } catch (err) {
    console.error('[getProfileTotalLikes]', err);
    return res.status(500).json({ success: false, message: err.message || 'Server error' });
  }
}

export async function getProfileLikeStatus(req, res) {
  try {
    const profileId = req.params.id;
    if (!mongoose.isValidObjectId(profileId)) {
      return res.status(400).json({ success: false, message: 'Invalid profile id' });
    }
    if (!req.user?._id) {
      return res.json({ success: true, likedToday: false });
    }
    const date = toYmd();
    const found = await ProfileLike.exists({
      profileUserId: profileId,
      likedByUserId: req.user._id,
      date,
    });
    return res.json({ success: true, likedToday: !!found });
  } catch (err) {
    console.error('[getProfileLikeStatus]', err);
    return res.status(500).json({ success: false, message: err.message || 'Server error' });
  }
}

export async function getProfileLikers(req, res) {
  try {
    const profileId = req.params.id;
    if (!mongoose.isValidObjectId(profileId)) {
      return res.status(400).json({ success: false, message: 'Invalid profile id' });
    }
    const exists = await User.exists({ _id: profileId });
    if (!exists) {
      return res.status(404).json({ success: false, message: 'Profile not found' });
    }

    const limitRaw = Number(req.query?.limit ?? 30);
    const limit = Math.max(1, Math.min(100, Number.isFinite(limitRaw) ? limitRaw : 30));

    const likes = await ProfileLike.find({ profileUserId: profileId })
      .sort({ createdAt: -1 })
      .limit(600)
      .select('likedByUserId createdAt')
      .lean();

    const seen = new Set();
    const likerIds = [];
    for (const like of likes) {
      const id = String(like?.likedByUserId || '');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      likerIds.push(id);
      if (likerIds.length >= limit) break;
    }

    if (likerIds.length === 0) {
      return res.json({ success: true, likers: [] });
    }

    const users = await User.find({ _id: { $in: likerIds } })
      .select('_id name profileImage profilePicture')
      .lean();
    const userMap = new Map(users.map((u) => [String(u._id), u]));

    const likers = likerIds
      .map((id) => userMap.get(id))
      .filter(Boolean)
      .map((u) => ({
        _id: u._id,
        name: u.name || 'User',
        avatar: u.profileImage || u.profilePicture || '',
      }));

    return res.json({ success: true, likers });
  } catch (err) {
    console.error('[getProfileLikers]', err);
    return res.status(500).json({ success: false, message: err.message || 'Server error' });
  }
}
