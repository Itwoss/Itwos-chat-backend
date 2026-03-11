import axios from 'axios';

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_API_URL = 'https://www.googleapis.com/youtube/v3/search';

/**
 * Parse YouTube duration (ISO 8601 format) to seconds
 * @param {string} duration - ISO 8601 duration string (e.g., "PT3M45S")
 * @returns {number} Duration in seconds
 */
const parseDuration = (duration) => {
  if (!duration) return 0;
  
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  
  const hours = parseInt(match[1] || 0, 10);
  const minutes = parseInt(match[2] || 0, 10);
  const seconds = parseInt(match[3] || 0, 10);
  
  return hours * 3600 + minutes * 60 + seconds;
};

/**
 * Check if title indicates it's NOT a full song
 * @param {string} title - Video title
 * @returns {boolean} True if it's likely NOT a full song
 */
const isNotFullSong = (title) => {
  const lowerTitle = title.toLowerCase();
  const excludeKeywords = [
    'cover',
    'remix',
    'short',
    'snippet',
    'clip',
    'teaser',
    'preview',
    'excerpt',
    'part 1',
    'part 2',
    'part 3',
    '1 hour',
    '2 hour',
    '3 hour',
    'extended',
    'loop',
    '10 hours',
    '1h',
    '2h',
    '3h',
    '10h',
    'live',
    'concert',
    'performance',
    'acoustic',
    'unplugged',
    'karaoke',
    'instrumental',
    'beat',
    'backing track',
  ];
  
  return excludeKeywords.some(keyword => lowerTitle.includes(keyword));
};

/**
 * Check if the query looks like a specific video/song title (long or with separators).
 * For such queries we skip "official audio song" and category filter so exact matches show.
 */
const isSpecificTitleSearch = (query) => {
  const q = (query || '').trim();
  return q.length > 50 || q.includes('|') || q.includes(' - ');
};

/**
 * Search for music videos on YouTube (full songs and soundtracks/teasers)
 * @param {string} query - Search query
 * @param {number} maxResults - Maximum number of results (default: 20)
 * @returns {Promise<Array>} Array of cleaned music track data
 */
export const searchYouTubeMusic = async (query, maxResults = 20) => {
  if (!YOUTUBE_API_KEY) {
    throw new Error('YouTube API key is not configured. Please set YOUTUBE_API_KEY in environment variables.');
  }

  if (!query || query.trim().length === 0) {
    throw new Error('Search query is required');
  }

  try {
    const trimmedQuery = query.trim();
    const specificTitle = isSpecificTitleSearch(trimmedQuery);
    // For specific titles (e.g. "Glimpse of KH x RK Reunion - Tamil | Kamal...") search as-is
    // so the exact YouTube video shows. For generic queries, bias toward full songs.
    const searchQuery = specificTitle ? trimmedQuery : `${trimmedQuery} official audio song`;

    const params = {
      part: 'snippet',
      maxResults: 50,
      q: searchQuery,
      type: 'video',
      order: 'relevance',
      key: YOUTUBE_API_KEY,
    };
    // Only restrict to Music category for generic searches; specific title search uses any category
    if (!specificTitle) {
      params.videoCategoryId = '10';
    }

    const searchResponse = await axios.get(YOUTUBE_API_URL, {
      params,
    });

    if (!searchResponse.data.items || searchResponse.data.items.length === 0) {
      return [];
    }

    // Get video IDs to fetch duration
    const videoIds = searchResponse.data.items.map(item => item.id.videoId);
    
    // Fetch video details including duration
    const detailsResponse = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
      params: {
        part: 'snippet,contentDetails',
        id: videoIds.join(','),
        key: YOUTUBE_API_KEY,
      },
    });

    // Create a map of videoId to details
    const videoDetailsMap = {};
    detailsResponse.data.items.forEach(item => {
      videoDetailsMap[item.id] = {
        duration: item.contentDetails?.duration || '',
        snippet: item.snippet,
      };
    });

    // Helper to format one item into track object
    const formatTrack = (item, snippet, duration) => {
      const videoId = item.id.videoId;
      const title = snippet.title || '';
      const thumbnail = snippet.thumbnails?.high?.url ||
        snippet.thumbnails?.medium?.url ||
        snippet.thumbnails?.default?.url ||
        null;
      const artist = snippet.channelTitle || 'Unknown Artist';
      let cleanTitle = title
        .replace(/\s*-\s*Official\s*(Video|Audio|Music Video|MV|Lyric Video|Lyrics).*/i, '')
        .replace(/\s*\(Official\s*(Video|Audio|Music Video|MV|Lyric Video|Lyrics)\).*/i, '')
        .trim();
      return {
        id: videoId,
        title: cleanTitle || title,
        artist,
        thumbnail,
        preview_url: `https://www.youtube.com/embed/${videoId}`,
        source: 'youtube',
        duration,
      };
    };

    // Filter and format tracks (full songs only first; for specific-title search use looser rules)
    const tracks = [];
    for (const item of searchResponse.data.items) {
      const videoId = item.id.videoId;
      const details = videoDetailsMap[videoId];
      if (!details) continue;

      const snippet = details.snippet || item.snippet;
      const duration = parseDuration(details.duration);
      const title = snippet.title || '';

      if (specificTitle) {
        // Specific title search: allow short teasers/glimpses (30s–20min), no title keyword filter
        if (duration < 30 || duration > 1200) continue;
      } else {
        // Strict: duration 2–15 min, exclude covers/remixes/shorts etc.
        if (duration < 120 || duration > 900) continue;
        if (isNotFullSong(title)) continue;
      }

      tracks.push(formatTrack(item, snippet, duration));
      if (tracks.length >= maxResults) break;
    }

    // Fallback: if no "full song" results, return music anyway (wider duration, no title filter)
    if (tracks.length === 0 && !specificTitle) {
      for (const item of searchResponse.data.items) {
        const details = videoDetailsMap[item.id.videoId];
        if (!details) continue;
        const duration = parseDuration(details.duration);
        // Accept 1–20 min so we don't show shorts or 10-hour loops
        if (duration < 60 || duration > 1200) continue;
        const snippet = details.snippet || item.snippet;
        tracks.push(formatTrack(item, snippet, duration));
        if (tracks.length >= maxResults) break;
      }
    }

    return tracks;
  } catch (error) {
    console.error('[YouTube Service] Error searching music:', error);
    
    if (error.response) {
      // YouTube API error
      const errorMessage = error.response.data?.error?.message || 'YouTube API error';
      throw new Error(`YouTube API error: ${errorMessage}`);
    }
    
    throw new Error('Failed to search YouTube music');
  }
};

/**
 * Get video details by ID (for additional metadata if needed)
 * @param {string} videoId - YouTube video ID
 * @returns {Promise<Object>} Video details
 */
export const getVideoDetails = async (videoId) => {
  if (!YOUTUBE_API_KEY) {
    throw new Error('YouTube API key is not configured');
  }

  try {
    const response = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
      params: {
        part: 'snippet,contentDetails',
        id: videoId,
        key: YOUTUBE_API_KEY,
      },
    });

    if (response.data.items.length === 0) {
      throw new Error('Video not found');
    }

    return response.data.items[0];
  } catch (error) {
    console.error('[YouTube Service] Error getting video details:', error);
    throw new Error('Failed to get video details');
  }
};

