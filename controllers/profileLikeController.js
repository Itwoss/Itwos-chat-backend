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
    if (likedBy.toString() === profileId) {
      return res.status(400).json({ success: false, message: 'You cannot like your own profile' });
    }
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
