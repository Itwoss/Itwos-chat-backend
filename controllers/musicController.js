import { searchYouTubeMusic } from '../services/youtube.js';

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

