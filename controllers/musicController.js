import { searchYouTubeMusic } from '../services/youtube.js';
import User from '../models/User.js';

const SAVED_SONGS_MAX = 500;

function normalizeTrack(track) {
  const id = track.id ?? track.video_id;
  if (!id) return null;
  return {
    video_id: id,
    title: track.title ?? '',
    artist: track.artist ?? '',
    thumbnail: track.thumbnail ?? null,
    preview_url: track.preview_url ?? (id ? `https://www.youtube.com/embed/${id}` : null),
    source: track.source ?? 'youtube',
    startTime: track.startTime ?? 0,
    endTime: track.endTime ?? null,
  };
}

/**
 * Get current user's saved songs
 * GET /api/music/saved
 */
export const getSavedSongs = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('savedSongs').lean();
    const list = (user?.savedSongs || []).map((s) => ({
      id: s.video_id,
      video_id: s.video_id,
      title: s.title,
      artist: s.artist,
      thumbnail: s.thumbnail,
      preview_url: s.preview_url,
      source: s.source,
      startTime: s.startTime,
      endTime: s.endTime,
    }));
    res.status(200).json({ success: true, data: list });
  } catch (error) {
    console.error('[Music Controller] getSavedSongs:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to get saved songs' });
  }
};

/**
 * Save a song for the current user
 * POST /api/music/saved
 * Body: { id?, video_id?, title?, artist?, thumbnail?, preview_url?, source?, startTime?, endTime? }
 */
export const saveSong = async (req, res) => {
  try {
    const payload = normalizeTrack(req.body);
    if (!payload) {
      return res.status(400).json({ success: false, message: 'Invalid track (missing id/video_id)' });
    }
    const user = await User.findById(req.user._id);
    if (!user) return res.status(401).json({ success: false, message: 'User not found' });
    const existing = (user.savedSongs || []).find((s) => s.video_id === payload.video_id);
    if (existing) {
      return res.status(200).json({ success: true, data: user.savedSongs, message: 'Already saved' });
    }
    if (!user.savedSongs) user.savedSongs = [];
    if (user.savedSongs.length >= SAVED_SONGS_MAX) {
      return res.status(400).json({
        success: false,
        message: `You can save at most ${SAVED_SONGS_MAX} songs. Remove some to add more.`,
      });
    }
    user.savedSongs.unshift({
      ...payload,
      savedAt: new Date(),
    });
    await user.save();
    const list = (user.savedSongs || []).map((s) => ({
      id: s.video_id,
      video_id: s.video_id,
      title: s.title,
      artist: s.artist,
      thumbnail: s.thumbnail,
      preview_url: s.preview_url,
      source: s.source,
      startTime: s.startTime,
      endTime: s.endTime,
    }));
    res.status(201).json({ success: true, data: list });
  } catch (error) {
    console.error('[Music Controller] saveSong:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to save song' });
  }
};

/**
 * Remove a saved song by video_id
 * DELETE /api/music/saved/:videoId
 */
export const unsaveSong = async (req, res) => {
  try {
    const { videoId } = req.params;
    if (!videoId) {
      return res.status(400).json({ success: false, message: 'videoId is required' });
    }
    const user = await User.findById(req.user._id);
    if (!user) return res.status(401).json({ success: false, message: 'User not found' });
    if (!user.savedSongs) user.savedSongs = [];
    const before = user.savedSongs.length;
    user.savedSongs = user.savedSongs.filter((s) => String(s.video_id) !== String(videoId));
    if (user.savedSongs.length === before) {
      return res.status(200).json({ success: true, data: user.savedSongs, message: 'Not in list' });
    }
    await user.save();
    const list = (user.savedSongs || []).map((s) => ({
      id: s.video_id,
      video_id: s.video_id,
      title: s.title,
      artist: s.artist,
      thumbnail: s.thumbnail,
      preview_url: s.preview_url,
      source: s.source,
      startTime: s.startTime,
      endTime: s.endTime,
    }));
    res.status(200).json({ success: true, data: list });
  } catch (error) {
    console.error('[Music Controller] unsaveSong:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to unsave song' });
  }
};

/**
 * Get trending / today's top music (e.g. for "Today's Top 20 Trending Songs")
 * GET /api/music/trending?limit=20
 */
export const getTrendingTracks = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 20);
    const tracks = await searchYouTubeMusic('trending music hits 2024', limit);
    res.status(200).json({
      success: true,
      data: tracks,
    });
  } catch (error) {
    console.error('[Music Controller] Error fetching trending:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch trending tracks',
    });
  }
};

/**
 * Search for music tracks on YouTube
 * GET /api/music/search?q=query
 * 
 * Returns cleaned data:
 * {
 *   id: videoId,
 *   title: title,
 *   artist: channelTitle,
 *   thumbnail: high thumbnail,
 *   preview_url: "https://www.youtube.com/embed/{videoId}",
 *   source: "youtube"
 * }
 */
export const searchTracks = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required',
      });
    }

    // Search YouTube Music - request more results to account for filtering
    const tracks = await searchYouTubeMusic(q.trim(), 50);

    res.status(200).json({
      success: true,
      data: tracks,
    });
  } catch (error) {
    console.error('[Music Controller] Error searching tracks:', error);
    
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to search tracks',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
};

