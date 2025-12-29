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
 * Search for music videos on YouTube (full songs only)
 * @param {string} query - Search query
 * @param {number} maxResults - Maximum number of results (default: 20)
 * @returns {Promise<Array>} Array of cleaned music track data (full songs only)
 */
export const searchYouTubeMusic = async (query, maxResults = 20) => {
  if (!YOUTUBE_API_KEY) {
    throw new Error('YouTube API key is not configured. Please set YOUTUBE_API_KEY in environment variables.');
  }

  if (!query || query.trim().length === 0) {
    throw new Error('Search query is required');
  }

  try {
    // Enhance query to prioritize full songs
    const enhancedQuery = `${query.trim()} official audio song`;
    
    // Search for more results initially to filter down to full songs
    // Request up to 50 results (YouTube API max) to get enough full songs after filtering
    const searchResponse = await axios.get(YOUTUBE_API_URL, {
      params: {
        part: 'snippet',
        maxResults: 50, // YouTube API maximum - get as many as possible
        q: enhancedQuery,
        type: 'video',
        videoCategoryId: '10', // Music category
        order: 'relevance', // Most relevant first
        key: YOUTUBE_API_KEY,
      },
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

    // Filter and format tracks (full songs only)
    const tracks = [];
    for (const item of searchResponse.data.items) {
      const videoId = item.id.videoId;
      const details = videoDetailsMap[videoId];
      
      if (!details) continue;

      const snippet = details.snippet || item.snippet;
      const duration = parseDuration(details.duration);
      const title = snippet.title || '';

      // Filter criteria for full songs:
      // 1. Duration between 2 minutes (120s) and 15 minutes (900s) - typical song length
      // 2. Exclude titles with keywords indicating covers, remixes, shorts, etc.
      // 3. Exclude very long videos (likely compilations or extended versions)
      
      if (duration < 120 || duration > 900) {
        continue; // Too short or too long
      }

      if (isNotFullSong(title)) {
        continue; // Likely not a full song
      }

      // Get high-quality thumbnail
      const thumbnail = snippet.thumbnails?.high?.url || 
                       snippet.thumbnails?.medium?.url || 
                       snippet.thumbnails?.default?.url || 
                       null;

      // Extract artist name from channel title
      const artist = snippet.channelTitle || 'Unknown Artist';

      // Clean title (remove common suffixes like "Official Video", etc.)
      let cleanTitle = title;
      cleanTitle = cleanTitle.replace(/\s*-\s*Official\s*(Video|Audio|Music Video|MV|Lyric Video|Lyrics).*/i, '');
      cleanTitle = cleanTitle.replace(/\s*\(Official\s*(Video|Audio|Music Video|MV|Lyric Video|Lyrics)\).*/i, '');
      cleanTitle = cleanTitle.trim();

      tracks.push({
        id: videoId,
        title: cleanTitle,
        artist: artist,
        thumbnail: thumbnail,
        preview_url: `https://www.youtube.com/embed/${videoId}`,
        source: 'youtube',
        duration: duration, // Include duration for reference
      });

      // Stop when we have enough full songs
      if (tracks.length >= maxResults) {
        break;
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

