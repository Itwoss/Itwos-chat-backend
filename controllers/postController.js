import Post from '../models/Post.js';
import PostAddition from '../models/PostAddition.js';
import User from '../models/User.js';
import FriendRequest from '../models/FriendRequest.js';
import { validationResult } from 'express-validator';
import cloudinary from '../utils/cloudinary.js';
import fs from 'fs';
import mongoose from 'mongoose';
import { addCount } from '../services/countService.js';
import { createNotification } from './notificationController.js';
import Notification from '../models/Notification.js';

/** First `getTrendingSections` call after boot only seeds snapshot (no burst of notifications). */
let trendingSnapshotInitialized = false;
let lastTrendingPostIdSet = new Set();

const TRENDING_NOTIF_MESSAGE =
  '🎉 Your post is now trending worldwide! Enhance it by updating the thumbnail and adding a catchy one-line title.';
const TRENDING_NOTIF_TITLE = 'Trending worldwide';
const TRENDING_NOTIF_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * When a post appears in any trending list and was not on the previous snapshot, notify the author once
 * (per post, within cooldown window, to avoid duplicates if snapshot resets).
 */
async function notifyNewlyTrendingPosts(todaySorted, topLiked, mostDiscussedSorted, mostViewed) {
  const arrays = [todaySorted, topLiked, mostDiscussedSorted, mostViewed];
  const currentIds = new Set();
  const postById = new Map();
  for (const arr of arrays) {
    for (const p of arr || []) {
      if (!p?._id) continue;
      const id = String(p._id);
      currentIds.add(id);
      if (!postById.has(id)) postById.set(id, p);
    }
  }

  if (!trendingSnapshotInitialized) {
    lastTrendingPostIdSet = new Set(currentIds);
    trendingSnapshotInitialized = true;
    return;
  }

  const previous = lastTrendingPostIdSet;
  const since = new Date(Date.now() - TRENDING_NOTIF_COOLDOWN_MS);

  for (const id of currentIds) {
    if (previous.has(id)) continue;
    const post = postById.get(id);
    if (!post) continue;
    const authorRef = post.author?._id ?? post.author;
    if (!authorRef) continue;
    const ownerId = authorRef.toString();
    const link = `/user/home?trendingPost=${id}`;

    try {
      const dup = await Notification.findOne({
        userId: authorRef,
        type: 'trending',
        link,
        createdAt: { $gte: since },
      })
        .select('_id')
        .lean();
      if (dup) continue;

      await createNotification(
        ownerId,
        'trending',
        TRENDING_NOTIF_TITLE,
        TRENDING_NOTIF_MESSAGE,
        null,
        null,
        link,
        null
      );
    } catch (err) {
      console.error('[PostController] Trending notification error:', err?.message || err);
    }
  }

  lastTrendingPostIdSet = new Set(currentIds);
}

// Create a new post
export const createPost = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const userId = req.user._id;
    const body = req.body || {};
    const postTitle = body.title;
    const content = body.content;
    const sound = body.sound;
    const imageEditMetadataRaw = body.imageEditMetadata;
    const customRadius = body.borderRadius;
    const videoRatioRaw = body.videoRatio;
    const videoTrimStartRaw = body.videoTrimStart;
    const videoTrimEndRaw = body.videoTrimEnd;
    const linksRaw = body.links;
    if (!linksRaw && req.body && Object.keys(req.body).length > 0) {
      console.warn('createPost: body.links missing', Object.keys(req.body));
    }
    const hashtagsRaw = body.hashtags;
    const mentionsRaw = body.mentions;
    const fileList = req.files?.files || [];
    const files = Array.isArray(fileList) ? fileList : [];
    const thumbnailFile = req.files?.videoThumbnail?.[0];
    
    // Allow posts with content, images, or song (at least one must be present)
    const hasContent = content && content.trim().length > 0;
    const hasFiles = files && files.length > 0;

    if (!postTitle || !postTitle.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Post title is required'
      });
    }
    if (!hasContent && !hasFiles) {
      return res.status(400).json({
        success: false,
        message: 'Post must have content, images, a song, or a video'
      });
    }

    // Upload images, song, and video to Cloudinary if any
    const imageUrls = [];
    let songUrl = null;
    let videoUrl = null;
    let videoThumbnailUrl = null;

    if (thumbnailFile) {
      try {
        const result = await cloudinary.uploader.upload(thumbnailFile.path, {
          folder: 'chat-app/posts/thumbnails',
          resource_type: 'image',
        });
        videoThumbnailUrl = result.secure_url;
        if (fs.existsSync(thumbnailFile.path)) fs.unlinkSync(thumbnailFile.path);
      } catch (e) {
        console.error('Error uploading video thumbnail:', e);
      }
    }

    if (files && files.length > 0) {
      for (const file of files) {
        try {
          const isAudio = file.mimetype?.startsWith('audio/') ||
            /\.(mp3|m4a|wav|ogg|aac|webm|mp4)$/i.test(file.originalname || '');
          const isVideo = !isAudio && (file.mimetype?.startsWith('video/') || /\.(mp4|webm|mov|avi)$/i.test(file.originalname || ''));
          const folder = isAudio ? 'chat-app/posts/songs' : (isVideo ? 'chat-app/posts/videos' : 'chat-app/posts');
          const resourceType = isAudio ? 'video' : (isVideo ? 'video' : 'image'); // Cloudinary uses 'video' for audio

          const result = await cloudinary.uploader.upload(file.path, {
            folder,
            resource_type: resourceType,
          });

          if (isAudio) {
            songUrl = result.secure_url;
            if (process.env.NODE_ENV !== 'production') {
              console.log('[Post Controller] Saved song URL for post:', result.secure_url?.slice(0, 60) + '...');
            }
          } else if (isVideo) {
            videoUrl = result.secure_url;
          } else {
            imageUrls.push(result.secure_url);
          }

          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        } catch (uploadError) {
          console.error('Error uploading file:', uploadError);
          if (file.mimetype?.startsWith('audio/') || /\.(mp3|m4a|wav|ogg|aac|webm)$/i.test(file.originalname || '')) {
            console.error('[Post Controller] Audio upload failed – post.song will be null. Check Cloudinary config and file.', uploadError?.message || uploadError);
          }
        }
      }
    }

    // Parse sound metadata if provided
    let soundData = null;
    if (sound) {
      try {
        soundData = typeof sound === 'string' ? JSON.parse(sound) : sound;
      } catch (e) {
        console.error('[Post Controller] Error parsing sound data:', e);
      }
    }

    // Parse per-image edit metadata (ratio 9:16, 1:1, 4:5, etc.) so feed shows correct aspect ratio
    let imageEditMetadata = null;
    if (imageEditMetadataRaw) {
      try {
        const parsed = typeof imageEditMetadataRaw === 'string' ? JSON.parse(imageEditMetadataRaw) : imageEditMetadataRaw;
        if (Array.isArray(parsed) && parsed.length > 0 && parsed.some((item) => item && typeof item === 'object' && item.ratio)) {
          imageEditMetadata = parsed;
        }
      } catch (e) {
        console.error('[Post Controller] Error parsing imageEditMetadata:', e);
      }
    }

    const videoRatio = videoRatioRaw && ['1:1', '4:5', '16:9', '9:16'].includes(String(videoRatioRaw).trim()) ? String(videoRatioRaw).trim() : '4:5';
    const videoTrimStart = videoTrimStartRaw != null && videoTrimStartRaw !== '' ? parseFloat(videoTrimStartRaw) : null;
    const videoTrimEnd = videoTrimEndRaw != null && videoTrimEndRaw !== '' ? parseFloat(videoTrimEndRaw) : null;

    let links = [];
    if (linksRaw) {
      try {
        const parsed = typeof linksRaw === 'string' ? JSON.parse(linksRaw) : linksRaw;
        if (Array.isArray(parsed)) {
          links = parsed
            .filter((l) => l && (String(l.name || '').trim() || String(l.url || '').trim()))
            .slice(0, 3)
            .map((l) => ({ name: String(l.name || '').trim(), url: String(l.url || '').trim() }));
        }
      } catch (e) {
        console.error('[Post Controller] Error parsing links:', e);
      }
    }

    // Hashtags: from body array or extract from content (#word)
    let hashtags = [];
    if (Array.isArray(hashtagsRaw) && hashtagsRaw.length > 0) {
      hashtags = hashtagsRaw
        .filter((h) => typeof h === 'string' && h.trim())
        .map((h) => h.trim().toLowerCase().replace(/^#/, ''))
        .slice(0, 30);
    }
    if (hashtags.length === 0 && hasContent) {
      const matches = content.match(/#[\w\u00C0-\u024F]+/g) || [];
      const seen = new Set();
      matches.forEach((m) => {
        const tag = m.slice(1).toLowerCase();
        if (tag.length >= 2 && !seen.has(tag)) {
          seen.add(tag);
          hashtags.push(tag);
        }
      });
      hashtags = hashtags.slice(0, 30);
    }

    // Mentions: array of user ObjectIds (must be valid)
    let mentionIds = [];
    if (Array.isArray(mentionsRaw) && mentionsRaw.length > 0) {
      const valid = mentionsRaw.filter((id) => mongoose.Types.ObjectId.isValid(id));
      mentionIds = [...new Set(valid)].slice(0, 20);
    }

    const post = await Post.create({
      author: userId,
      title: postTitle.trim(),
      content: hasContent ? content.trim() : (imageUrls.length > 0 || songUrl || videoUrl ? '' : undefined),
      hashtags: hashtags.length > 0 ? hashtags : undefined,
      mentions: mentionIds.length > 0 ? mentionIds : undefined,
      images: imageUrls,
      song: songUrl,
      video: videoUrl || undefined,
      videoThumbnail: videoThumbnailUrl || undefined,
      videoRatio: videoUrl ? videoRatio : undefined,
      ...(videoUrl && videoTrimStart != null && { videoTrimStart }),
      ...(videoUrl && videoTrimEnd != null && { videoTrimEnd }),
      sound: soundData || undefined,
      ...(imageEditMetadata && { imageEditMetadata }),
      ...(links.length > 0 && { links }),
      ...(customRadius && customRadius.trim() && { borderRadius: customRadius.trim() }),
    });

    const populatedPost = await Post.findById(post._id)
      .populate('author', 'name email profileImage accountType subscription')
      .populate('mentions', 'name profileImage subscription')
      .populate('likes', 'name profileImage subscription')
      .populate('comments.user', 'name profileImage subscription')
      .populate('comments.mentions', 'name profileImage subscription');

    // Emit real-time notification to admins for new post
    const io = req.app?.get('io');
    if (io) {
      io.to('admin').emit('new-post', {
        post: populatedPost,
        message: `New post from ${req.user.name}`
      });
      io.to('admin-room').emit('new-post', {
        post: populatedPost,
        message: `New post from ${req.user.name}`
      });
    }

    res.status(201).json({
      success: true,
      message: 'Post created successfully',
      data: populatedPost
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create post',
      error: error.message
    });
  }
};

const FEED_POST_POPULATE = [
  { path: 'author', select: 'name email profileImage accountType subscription' },
  { path: 'mentions', select: 'name profileImage subscription' },
  { path: 'likes', select: 'name profileImage subscription' },
  { path: 'comments.user', select: 'name profileImage subscription' },
  { path: 'comments.mentions', select: 'name profileImage subscription' },
];

function postAuthorVisibleInFeed(viewerIdStr, postDoc, allAuthorIdsSet) {
  if (!postDoc || postDoc.isRemoved) return false;
  const raw = postDoc.author;
  const aid = raw && typeof raw === 'object' && raw._id != null
    ? raw._id.toString()
    : (raw != null ? String(raw) : '');
  if (!aid) return false;
  if (aid === viewerIdStr) return true;
  return allAuthorIdsSet.has(aid);
}

function feedSortTimeMs(item) {
  if (item.addedAt) return new Date(item.addedAt).getTime();
  return new Date(item.createdAt || 0).getTime();
}

// Get feed posts (posts from friends, following, and public accounts) + "added" reposts
export const getFeed = async (req, res) => {
  try {
    const userId = req.user._id;
    const viewerIdStr = userId.toString();
    const { page = 1, limit = 10 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
    const skip = (pageNum - 1) * limitNum;

    // Get user's friends (mutual follows - status 'accepted')
    const friendships = await FriendRequest.find({
      $or: [
        { fromUser: userId, status: 'accepted' },
        { toUser: userId, status: 'accepted' }
      ]
    })
      .select('fromUser toUser')
      .lean();

    const friendIds = new Set();
    friendships.forEach(fr => {
      const friendId = fr.fromUser.toString() === userId.toString()
        ? fr.toUser.toString()
        : fr.fromUser.toString();
      friendIds.add(friendId);
    });

    // Get one-way following (users you follow - status 'following')
    const followingRecords = await FriendRequest.find({
      fromUser: userId,
      status: 'following'
    })
      .select('toUser')
      .lean();
    const followingIds = new Set(followingRecords.map(fr => fr.toUser.toString()));

    // Combine friends + following (no duplicates)
    const followedAndFriendIds = new Set([...friendIds, ...followingIds]);

    // Get public account IDs (excluding already followed/friends and self)
    const excludeIds = [viewerIdStr, ...Array.from(followedAndFriendIds)];
    const publicUsers = await User.find({
      accountType: 'public',
      _id: { $nin: excludeIds.map(id => new mongoose.Types.ObjectId(id)) }
    }).select('_id').lean();
    const publicUserIds = publicUsers.map(u => u._id.toString());

    // Build query: posts from self, friends, following, OR public accounts
    const allAuthorIds = new Set([
      viewerIdStr,
      ...Array.from(followedAndFriendIds),
      ...publicUserIds
    ]);
    const allAuthorIdsSet = allAuthorIds;
    const authorObjectIds = Array.from(allAuthorIds).map((id) => new mongoose.Types.ObjectId(id));

    const query = {
      author: { $in: authorObjectIds },
      isRemoved: { $ne: true }
    };

    const friendObjectIds = Array.from(friendIds).map((id) => new mongoose.Types.ObjectId(id));
    const additionQuery = {
      $or: [
        { visibility: 'public' },
        ...(friendObjectIds.length ? [{ visibility: 'friends', adder: { $in: friendObjectIds } }] : [])
      ]
    };

    const fetchCap = Math.min(250, skip + limitNum);

    const [rawPosts, rawAdditions, postTotal, additionTotal] = await Promise.all([
      Post.find(query)
        .populate(FEED_POST_POPULATE)
        .sort({ createdAt: -1 })
        .limit(fetchCap)
        .lean(),
      PostAddition.find(additionQuery)
        .populate({ path: 'post', populate: FEED_POST_POPULATE })
        .populate({ path: 'adder', select: 'name email profileImage accountType subscription' })
        .sort({ addedAt: -1 })
        .limit(fetchCap)
        .lean(),
      Post.countDocuments(query),
      PostAddition.countDocuments(additionQuery)
    ]);

    const postItems = rawPosts
      .filter((p) => p && p._id)
      .map((p) => ({
        ...p,
        _feedItemId: p._id.toString(),
      }));

    const additionItems = [];
    for (const a of rawAdditions) {
      const p = a.post;
      if (!p || p.isRemoved) continue;
      if (!postAuthorVisibleInFeed(viewerIdStr, p, allAuthorIdsSet)) continue;
      additionItems.push({
        ...p,
        _feedItemId: a._id.toString(),
        addedBy: a.adder,
        addedAt: a.addedAt,
        addVisibility: a.visibility,
      });
    }

    const merged = [...postItems, ...additionItems].sort(
      (x, y) => feedSortTimeMs(y) - feedSortTimeMs(x)
    );

    const byPostId = new Map();
    for (const item of merged) {
      const pid = item._id && item._id.toString();
      if (!pid) continue;
      const cur = byPostId.get(pid);
      if (!cur) {
        byPostId.set(pid, item);
        continue;
      }
      if (item.addedBy && !cur.addedBy) {
        byPostId.set(pid, item);
        continue;
      }
      if (!item.addedBy && cur.addedBy) continue;
      if (feedSortTimeMs(item) > feedSortTimeMs(cur)) byPostId.set(pid, item);
    }
    const deduped = [...byPostId.values()].sort((a, b) => feedSortTimeMs(b) - feedSortTimeMs(a));

    const pageItems = deduped.slice(skip, skip + limitNum);
    const totalApprox = postTotal + additionTotal;

    res.status(200).json({
      success: true,
      data: pageItems,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalApprox,
        pages: Math.max(1, Math.ceil(totalApprox / limitNum))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch feed',
      error: error.message
    });
  }
};

// Hotstar-style trending sections for home
const TRENDING_LIMIT = 12;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;

const baseQuery = { isRemoved: { $ne: true } };

export const getTrendingSections = async (req, res) => {
  try {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - ONE_DAY_MS);
    const sevenDaysAgo = new Date(now.getTime() - SEVEN_DAYS_MS);

    const populateAuthor = [
      { path: 'author', select: 'name email profileImage accountType subscription' },
      { path: 'likes', select: 'name profileImage subscription' },
      { path: 'comments.user', select: 'name profileImage subscription' },
    ];

    // 1. Today's Trending – last 24h, engagement score (likes + comments*2 + views*0.1)
    const todayTrending = await Post.find({
      ...baseQuery,
      createdAt: { $gte: oneDayAgo },
    })
      .populate(populateAuthor[0])
      .populate(populateAuthor[1])
      .populate(populateAuthor[2])
      .limit(TRENDING_LIMIT * 3)
      .lean();

    const todaySorted = todayTrending
      .map((p) => ({
        ...p,
        _engagement: (p.likes?.length || 0) * 2 + (p.comments?.length || 0) * 3 + (p.viewCount || 0) * 0.1,
      }))
      .sort((a, b) => (b._engagement || 0) - (a._engagement || 0))
      .slice(0, TRENDING_LIMIT)
      .map(({ _engagement, ...rest }) => rest);

    // 2. Top Liked – last 7 days, most likes (sort by likes length in memory)
    const topLikedRaw = await Post.find({
      ...baseQuery,
      createdAt: { $gte: sevenDaysAgo },
    })
      .populate(populateAuthor[0])
      .populate(populateAuthor[1])
      .populate(populateAuthor[2])
      .limit(TRENDING_LIMIT * 2)
      .lean();
    const topLiked = topLikedRaw
      .sort((a, b) => (b.likes?.length || 0) - (a.likes?.length || 0))
      .slice(0, TRENDING_LIMIT);

    // 3. Most Discussed – last 7 days, most comments
    const mostDiscussedRaw = await Post.find({
      ...baseQuery,
      createdAt: { $gte: sevenDaysAgo },
    })
      .populate(populateAuthor[0])
      .populate(populateAuthor[1])
      .populate(populateAuthor[2])
      .limit(TRENDING_LIMIT * 3)
      .lean();
    const mostDiscussedSorted = mostDiscussedRaw
      .sort((a, b) => (b.comments?.length || 0) - (a.comments?.length || 0))
      .slice(0, TRENDING_LIMIT);

    // 4. Most Viewed – all time, highest viewCount
    const mostViewed = await Post.find(baseQuery)
      .populate(populateAuthor[0])
      .populate(populateAuthor[1])
      .populate(populateAuthor[2])
      .sort({ viewCount: -1 })
      .limit(TRENDING_LIMIT)
      .lean();

    await notifyNewlyTrendingPosts(todaySorted, topLiked, mostDiscussedSorted, mostViewed);

    res.status(200).json({
      success: true,
      data: {
        todayTrending: todaySorted,
        topLiked,
        mostDiscussed: mostDiscussedSorted,
        mostViewed,
      },
    });
  } catch (error) {
    console.error('getTrendingSections error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch trending sections',
      error: error.message,
    });
  }
};

// Get user's own posts
export const getUserPosts = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user._id;
    const { page = 1, limit = 10, archived = 'false' } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const showArchived = archived === 'true';

    // Check if user can view posts
    const targetUser = await User.findById(userId).select('accountType').lean();
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // If viewing own posts, show all (with archive filter) but exclude removed posts
    if (userId === currentUserId.toString()) {
      const query = { 
        author: userId, 
        isArchived: showArchived,
        isRemoved: { $ne: true } // Exclude removed posts even from own profile
      };
      
      const posts = await Post.find(query)
        .populate('author', 'name email profileImage accountType')
        .populate('likes', 'name profileImage')
        .populate('comments.user', 'name profileImage')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const total = await Post.countDocuments(query);

      return res.status(200).json({
        success: true,
        data: posts,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      });
    }

    // If public account, anyone can view (but not archived or removed posts)
    if (targetUser.accountType === 'public') {
      const query = { 
        author: userId, 
        isArchived: false,
        isRemoved: { $ne: true } // Exclude removed posts
      };
      
      const posts = await Post.find(query)
        .populate('author', 'name email profileImage accountType')
        .populate('likes', 'name profileImage')
        .populate('comments.user', 'name profileImage')
      .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const total = await Post.countDocuments(query);

      return res.status(200).json({
      success: true,
      data: posts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
          pages: Math.ceil(total / parseInt(limit))
        }
      });
    }

    // If private account, check if they are friends
    const friendship = await FriendRequest.findOne({
      $or: [
        { fromUser: currentUserId, toUser: userId, status: 'accepted' },
        { fromUser: userId, toUser: currentUserId, status: 'accepted' }
      ]
    });

    if (!friendship) {
      return res.status(200).json({
        success: true,
        data: [],
        isPrivateProfile: true,
        message: 'You can only view posts from friends for private accounts',
        pagination: { page: parseInt(page), limit: parseInt(limit), total: 0, pages: 0 }
      });
    }

    // Private account - only show non-archived and non-removed posts to friends
    const query = {
      author: userId,
      isArchived: false,
      isRemoved: { $ne: true } // Exclude removed posts
    };

    const posts = await Post.find(query)
      .populate('author', 'name email profileImage accountType subscription')
      .populate('mentions', 'name profileImage subscription')
      .populate('likes', 'name profileImage subscription')
      .populate('comments.user', 'name profileImage subscription')
      .populate('comments.mentions', 'name profileImage subscription')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Post.countDocuments(query);

    res.status(200).json({
      success: true,
      data: posts,
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
      message: 'Failed to fetch user posts',
      error: error.message
    });
  }
};

async function viewerCanSeePostDoc(viewerId, postDoc) {
  if (!postDoc || postDoc.isRemoved) return false;
  const authorId = postDoc.author?._id || postDoc.author;
  if (!authorId) return false;
  if (authorId.toString() === viewerId.toString()) return true;
  if (postDoc.isArchived) return false;
  const author = await User.findById(authorId).select('accountType').lean();
  if (!author) return false;
  if (author.accountType === 'public') return true;
  const friendship = await FriendRequest.findOne({
    $or: [
      { fromUser: viewerId, toUser: authorId, status: 'accepted' },
      { fromUser: authorId, toUser: viewerId, status: 'accepted' }
    ]
  });
  return !!friendship;
}

/** Add someone else's post to your profile (friends-only or public); shows in feed with "added by". */
export const addPostToProfile = async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user._id;
    const visibility = req.body?.visibility;
    if (visibility !== 'friends' && visibility !== 'public') {
      return res.status(400).json({ success: false, message: 'visibility must be "friends" or "public"' });
    }
    const post = await Post.findById(postId).select('author isRemoved isArchived').lean();
    if (!post || post.isRemoved) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }
    if (post.author.toString() === userId.toString()) {
      return res.status(400).json({ success: false, message: 'Use your own posts tab for content you created' });
    }
    const canSee = await viewerCanSeePostDoc(userId, post);
    if (!canSee) {
      return res.status(403).json({ success: false, message: 'You cannot add this post' });
    }
    const doc = await PostAddition.findOneAndUpdate(
      { adder: userId, post: postId },
      { $set: { visibility, addedAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return res.status(200).json({
      success: true,
      message: 'Post added to your profile',
      data: { additionId: doc._id, visibility: doc.visibility, postId }
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(200).json({ success: true, message: 'Already added', data: {} });
    }
    return res.status(500).json({
      success: false,
      message: 'Failed to add post',
      error: error.message
    });
  }
};

export const removePostAdd = async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user._id;
    await PostAddition.deleteOne({ adder: userId, post: postId });
    return res.status(200).json({ success: true, message: 'Removed from your profile' });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to remove',
      error: error.message
    });
  }
};

/** Lightweight list for the current user (which posts they added + visibility). */
export const getMyPostAdditions = async (req, res) => {
  try {
    const userId = req.user._id;
    const rows = await PostAddition.find({ adder: userId }).select('post visibility addedAt').lean();
    return res.status(200).json({
      success: true,
      data: {
        additions: rows.map((r) => ({
          postId: r.post && r.post.toString(),
          visibility: r.visibility,
          addedAt: r.addedAt
        })).filter((r) => r.postId)
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch additions',
      error: error.message
    });
  }
};

/** Posts a user has "added" to their profile (respects addition visibility + post privacy). */
export const getUserAddedPosts = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user._id;
    const { page = 1, limit = 12 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 12));
    const skip = (pageNum - 1) * limitNum;

    const targetUser = await User.findById(userId).select('accountType').lean();
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const isSelf = userId === currentUserId.toString();
    let canSeeAny = isSelf;
    let isFriend = false;

    if (!isSelf) {
      if (targetUser.accountType === 'public') {
        canSeeAny = true;
      } else {
        const friendship = await FriendRequest.findOne({
          $or: [
            { fromUser: currentUserId, toUser: userId, status: 'accepted' },
            { fromUser: userId, toUser: currentUserId, status: 'accepted' }
          ]
        });
        isFriend = !!friendship;
        canSeeAny = isFriend;
      }
    }

    if (!canSeeAny) {
      return res.status(200).json({
        success: true,
        data: [],
        isPrivateProfile: targetUser.accountType === 'private',
        pagination: { page: pageNum, limit: limitNum, total: 0, pages: 0 }
      });
    }

    const additionFilter = { adder: userId };
    if (!isSelf) {
      if (isFriend) {
        additionFilter.$or = [{ visibility: 'public' }, { visibility: 'friends' }];
      } else {
        additionFilter.visibility = 'public';
      }
    }

    const total = await PostAddition.countDocuments(additionFilter);
    const additions = await PostAddition.find(additionFilter)
      .populate({
        path: 'post',
        populate: FEED_POST_POPULATE,
      })
      .populate({ path: 'adder', select: 'name profileImage subscription accountType' })
      .sort({ addedAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    const owner = await User.findById(userId).select('name profileImage subscription accountType').lean();

    const data = [];
    for (const a of additions) {
      const p = a.post;
      if (!p || p.isRemoved) continue;
      const ok = await viewerCanSeePostDoc(currentUserId, p);
      if (!ok) continue;
      data.push({
        ...p,
        _profileAdditionId: a._id.toString(),
        addedBy: a.adder || owner,
        addedAt: a.addedAt,
        addVisibility: a.visibility
      });
    }

    return res.status(200).json({
      success: true,
      data,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch added posts',
      error: error.message
    });
  }
};

// Save a post (add to user's savedPosts)
export const savePost = async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user._id;

    const post = await Post.findById(postId).select('_id').lean();
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    const user = await User.findById(userId).select('savedPosts').lean();
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const alreadySaved = (user.savedPosts || []).some(
      (s) => s.post && s.post.toString() === postId
    );
    if (alreadySaved) {
      return res.status(200).json({ success: true, message: 'Already saved' });
    }

    await User.findByIdAndUpdate(userId, {
      $push: { savedPosts: { post: postId, savedAt: new Date() } }
    });

    return res.status(200).json({ success: true, message: 'Post saved' });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to save post',
      error: error.message
    });
  }
};

// Unsave a post (remove from user's savedPosts)
export const unsavePost = async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user._id;

    await User.findByIdAndUpdate(userId, {
      $pull: { savedPosts: { post: postId } }
    });

    return res.status(200).json({ success: true, message: 'Post unsaved' });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to unsave post',
      error: error.message
    });
  }
};

// Get current user's saved posts
export const getSavedPosts = async (req, res) => {
  try {
    const userId = req.user._id;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const user = await User.findById(userId)
      .select('savedPosts')
      .populate({
        path: 'savedPosts.post',
        model: 'Post',
        populate: { path: 'author', select: 'name profileImage accountType' }
      })
      .lean();

    const saved = user?.savedPosts || [];
    const total = saved.length;
    const savedPaginated = saved
      .filter((s) => s.post != null)
      .reverse()
      .slice(skip, skip + limit)
      .map((s) => ({
        post: s.post,
        savedAt: s.savedAt,
        folderTitle: s.folderTitle || null
      }));

    return res.status(200).json({
      success: true,
      data: {
        savedPosts: savedPaginated,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit) || 1
        }
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch saved posts',
      error: error.message
    });
  }
};

// Update saved post folder (no-op until User.savedPosts is implemented)
export const updateSavedPostFolder = async (req, res) => {
  try {
    return res.status(200).json({ success: true, data: { savedPosts: [] } });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to update saved post folder',
      error: error.message
    });
  }
};

// Get single post by ID (for post details page / shared links)
export const getPostById = async (req, res) => {
  try {
    const { postId } = req.params;
    const currentUserId = req.user._id;

    const post = await Post.findById(postId).lean();
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }
    if (post.isRemoved) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    const authorId = post.author && post.author._id ? post.author._id : post.author;
    const isOwnPost = authorId && authorId.toString() === currentUserId.toString();

    if (post.isArchived && !isOwnPost) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    const author = await User.findById(authorId).select('accountType').lean();
    if (!author) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    if (!isOwnPost) {
      if (author.accountType === 'private') {
        const friendship = await FriendRequest.findOne({
          $or: [
            { fromUser: currentUserId, toUser: authorId, status: 'accepted' },
            { fromUser: authorId, toUser: currentUserId, status: 'accepted' }
          ]
        });
        if (!friendship) {
          return res.status(403).json({ success: false, message: 'You can only view posts from friends for private accounts' });
        }
      }
    }

    const populated = await Post.findById(postId)
      .populate('author', 'name email profileImage accountType')
      .populate('likes', 'name profileImage')
      .populate('comments.user', 'name profileImage')
      .lean();

    return res.status(200).json({ success: true, data: populated });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch post',
      error: error.message
    });
  }
};

// Like/Unlike a post
export const toggleLike = async (req, res) => {
  try {
    const userId = req.user._id;
    const { postId } = req.params;

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    // Check if post is removed
    if (post.isRemoved) {
      return res.status(403).json({
        success: false,
        message: 'This post has been removed'
      });
    }

    const isLiked = post.likes.includes(userId);

    if (isLiked) {
      // Unlike
      post.likes = post.likes.filter(likeId => likeId.toString() !== userId.toString());
    } else {
      // Like
      post.likes.push(userId);
    }

    await post.save();

    // Add count for like (only when liking, not unliking)
    if (!isLiked) {
      try {
        await addCount(userId, 'post_like', 1, {
          postId: postId
        });
      } catch (countError) {
        console.error('[PostController] Error adding count for like:', countError);
      }

      // Notify post owner (Instagram-style), not when liking own post
      try {
        const authorRef = post.author?._id ?? post.author;
        const ownerId = authorRef ? authorRef.toString() : null;
        if (ownerId && ownerId !== userId.toString()) {
          const liker = await User.findById(userId).select('name username').lean();
          const likerName = liker?.name?.trim() || liker?.username?.trim() || 'Someone';
          const link = `/user/profile/${userId}`;
          await createNotification(
            ownerId,
            'like',
            'New like',
            `${likerName} liked your post.`,
            null,
            null,
            link,
            userId
          );
        }
      } catch (notifErr) {
        console.error('[PostController] Error creating like notification:', notifErr);
      }
    }

    const updatedPost = await Post.findById(postId)
      .populate('author', 'name email profileImage accountType subscription')
      .populate('likes', 'name profileImage subscription')
      .populate('comments.user', 'name profileImage subscription')
      .populate('comments.mentions', 'name profileImage subscription');

    res.status(200).json({
      success: true,
      message: isLiked ? 'Post unliked' : 'Post liked',
      data: updatedPost
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to toggle like',
      error: error.message
    });
  }
};

// Add comment to a post
export const addComment = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const userId = req.user._id;
    const { postId } = req.params;
    const { content, mentions: mentionsRaw } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Comment content is required'
      });
    }

    const mentionIds = Array.isArray(mentionsRaw)
      ? mentionsRaw.filter((id) => mongoose.Types.ObjectId.isValid(id)).slice(0, 10)
      : [];

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    // Check if post is removed
    if (post.isRemoved) {
      return res.status(403).json({
        success: false,
        message: 'This post has been removed and cannot be commented on'
      });
    }

    post.comments.push({
      user: userId,
      content: content.trim(),
      mentions: mentionIds.length > 0 ? mentionIds : undefined
    });

    await post.save();

    // Add count for comment
    try {
      const newComment = post.comments[post.comments.length - 1];
      await addCount(userId, 'comment', 1, {
        postId: postId,
        commentId: newComment._id
      });
    } catch (countError) {
      console.error('[PostController] Error adding count for comment:', countError);
    }

    // Notify post owner (Instagram-style), not when commenting on own post
    try {
      const authorRef = post.author?._id ?? post.author;
      const ownerId = authorRef ? authorRef.toString() : null;
      if (ownerId && ownerId !== userId.toString()) {
        const commenter = await User.findById(userId).select('name username').lean();
        const commenterName = commenter?.name?.trim() || commenter?.username?.trim() || 'Someone';
        const trimmed = content.trim();
        const snippet = trimmed.length > 100 ? `${trimmed.slice(0, 100)}…` : trimmed;
        const link = `/user/profile/${userId}`;
        await createNotification(
          ownerId,
          'comment',
          'New comment',
          `${commenterName} commented: ${snippet}`,
          null,
          null,
          link,
          userId
        );
      }
    } catch (notifErr) {
      console.error('[PostController] Error creating comment notification:', notifErr);
    }

    const updatedPost = await Post.findById(postId)
      .populate('author', 'name email profileImage accountType subscription')
      .populate('mentions', 'name profileImage subscription')
      .populate('likes', 'name profileImage subscription')
      .populate('comments.user', 'name profileImage subscription')
      .populate('comments.mentions', 'name profileImage subscription');

    res.status(200).json({
      success: true,
      message: 'Comment added successfully',
      data: updatedPost
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to add comment',
      error: error.message
    });
  }
};

// Update a post (title, content, images, sound, video thumbnail)
export const updatePost = async (req, res) => {
  try {
    const userId = req.user._id;
    const { postId } = req.params;
    const { content, title: postTitle, existingImages: existingImagesRaw, sound: soundRaw, imageEditMetadata: imageEditMetadataRaw, links: linksRaw } = req.body;
    const fileList = req.files?.files || [];
    const files = Array.isArray(fileList) ? fileList : [];
    const thumbnailFile = req.files?.videoThumbnail?.[0];

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }
    if (post.author.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only edit your own posts'
      });
    }

    const isVideoPost = !!post.video;
    if (isVideoPost && (!postTitle || !String(postTitle).trim())) {
      return res.status(400).json({
        success: false,
        message: 'Post title is required'
      });
    }

    let existingImages = [];
    if (existingImagesRaw) {
      try {
        const parsed = typeof existingImagesRaw === 'string' ? JSON.parse(existingImagesRaw) : existingImagesRaw;
        if (Array.isArray(parsed)) existingImages = parsed.filter(Boolean);
      } catch (e) {
        console.error('[Post Controller] Error parsing existingImages:', e);
      }
    }

    let soundData = null;
    if (soundRaw) {
      try {
        soundData = typeof soundRaw === 'string' ? JSON.parse(soundRaw) : soundRaw;
      } catch (e) {
        console.error('[Post Controller] Error parsing sound:', e);
      }
    }

    let imageEditMetadata = null;
    if (imageEditMetadataRaw) {
      try {
        const parsed = typeof imageEditMetadataRaw === 'string' ? JSON.parse(imageEditMetadataRaw) : imageEditMetadataRaw;
        if (Array.isArray(parsed) && parsed.length > 0) imageEditMetadata = parsed;
      } catch (e) {
        console.error('[Post Controller] Error parsing imageEditMetadata:', e);
      }
    }

    let links = [];
    if (linksRaw !== undefined) {
      try {
        const parsed = typeof linksRaw === 'string' ? JSON.parse(linksRaw) : linksRaw;
        if (Array.isArray(parsed)) {
          links = parsed
            .filter((l) => l && (String(l.name || '').trim() || String(l.url || '').trim()))
            .slice(0, 3)
            .map((l) => ({ name: String(l.name || '').trim(), url: String(l.url || '').trim() }));
        }
      } catch (e) {
        console.error('[Post Controller] Error parsing links:', e);
      }
    }

    let videoThumbnailUrl = null;
    if (thumbnailFile) {
      try {
        const result = await cloudinary.uploader.upload(thumbnailFile.path, {
          folder: 'chat-app/posts/thumbnails',
          resource_type: 'image',
        });
        videoThumbnailUrl = result.secure_url;
        if (fs.existsSync(thumbnailFile.path)) fs.unlinkSync(thumbnailFile.path);
      } catch (e) {
        console.error('Error uploading video thumbnail:', e);
      }
    }

    const imageUrls = [...existingImages];
    for (const file of files) {
      if (!file.path) continue;
      const isImage = file.mimetype && file.mimetype.startsWith('image/');
      if (!isImage) continue;
      try {
        const result = await cloudinary.uploader.upload(file.path, {
          folder: 'chat-app/posts',
          resource_type: 'image',
        });
        imageUrls.push(result.secure_url);
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      } catch (e) {
        console.error('Error uploading image:', e);
      }
    }

    if (postTitle !== undefined) post.title = String(postTitle).trim();
    if (content !== undefined) post.content = String(content).trim();
    // Only update images when existingImages was sent (e.g. image post edit); do not clear for video post edit
    if (existingImagesRaw !== undefined) post.images = imageUrls;
    if (soundData !== undefined) post.sound = soundData;
    if (imageEditMetadata) post.imageEditMetadata = imageEditMetadata;
    if (linksRaw !== undefined) post.links = links;
    if (videoThumbnailUrl) post.videoThumbnail = videoThumbnailUrl;
    await post.save();

    const updatedPost = await Post.findById(postId)
      .populate('author', 'name email profileImage accountType subscription')
      .populate('likes', 'name profileImage subscription')
      .populate('comments.user', 'name profileImage subscription')
      .populate('comments.mentions', 'name profileImage subscription');

    res.status(200).json({
      success: true,
      message: 'Post updated successfully',
      data: updatedPost
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update post',
      error: error.message
    });
  }
};

// Delete a post
export const deletePost = async (req, res) => {
  try {
    const userId = req.user._id;
    const { postId } = req.params;

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    // Check if user is the author
    if (post.author.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own posts'
      });
    }

    // Delete images from Cloudinary if any
    if (post.images && post.images.length > 0) {
      for (const imageUrl of post.images) {
        try {
          const publicId = imageUrl.split('/').slice(-2).join('/').split('.')[0];
          await cloudinary.uploader.destroy(`chat-app/posts/${publicId}`);
        } catch (error) {
          console.error('Error deleting image from Cloudinary:', error);
        }
      }
    }

    // Delete song if exists
    if (post.song) {
      try {
        const publicId = post.song.split('/').slice(-2).join('/').split('.')[0];
        await cloudinary.uploader.destroy(`chat-app/posts/songs/${publicId}`, {
          resource_type: 'video'
        });
      } catch (error) {
        console.error('Error deleting song from Cloudinary:', error);
      }
    }

    await Post.findByIdAndDelete(postId);

    res.status(200).json({
      success: true,
      message: 'Post deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete post',
      error: error.message
    });
  }
};

// Archive a post
export const archivePost = async (req, res) => {
  try {
    const userId = req.user._id;
    const { postId } = req.params;

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    // Check if user is the author
    if (post.author.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only archive your own posts'
      });
    }

    post.isArchived = true;
    await post.save();

    res.status(200).json({
      success: true,
      message: 'Post archived successfully',
      data: post
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to archive post',
      error: error.message
    });
  }
};

// Unarchive a post
export const unarchivePost = async (req, res) => {
  try {
    const userId = req.user._id;
    const { postId } = req.params;

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    // Check if user is the author
    if (post.author.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only unarchive your own posts'
      });
    }

    post.isArchived = false;
    await post.save();

    res.status(200).json({
      success: true,
      message: 'Post unarchived successfully',
      data: post
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to unarchive post',
      error: error.message
    });
  }
};

// Record a post view (increments viewCount)
export const incrementPostView = async (req, res) => {
  try {
    const { postId } = req.params;

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    if (post.isRemoved) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    const viewCount = (post.viewCount ?? 0) + 1;
    await Post.findByIdAndUpdate(postId, { $set: { viewCount } });

    res.status(200).json({
      success: true,
      data: { counted: true, viewCount }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to record view',
      error: error.message
    });
  }
};