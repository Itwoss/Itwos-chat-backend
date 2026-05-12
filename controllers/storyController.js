import Story from '../models/Story.js';
import StoryInteraction from '../models/StoryInteraction.js';
import FriendRequest from '../models/FriendRequest.js';
import User from '../models/User.js';
import { createNotification } from './notificationController.js';
import mongoose from 'mongoose';
import { uploadMediaFromPath } from '../utils/mediaStorage.js';
import fs from 'fs';

/** Notify story owner over Socket.IO to refetch viewers (avoids static import cycle with server.js). */
async function pushStoryViewersUpdatedToOwner(ownerId, storyId) {
  if (!ownerId || !storyId) return;
  try {
    const { emitStoryViewersUpdated } = await import('../server.js');
    if (typeof emitStoryViewersUpdated === 'function') {
      emitStoryViewersUpdated(
        typeof ownerId === 'string' ? ownerId : ownerId.toString(),
        { storyId: String(storyId) }
      );
    }
  } catch (e) {
    console.error('[Story Controller] pushStoryViewersUpdatedToOwner:', e?.message || e);
  }
}

// Create a new story
export const createStory = async (req, res) => {
  try {
    const userId = req.user._id;
    const { caption, privacy, musicStartTime, musicEndTime, location, taggedUsers, sound, videoVolume, musicVolume } = req.body;

    let mediaUrl = req.body.mediaUrl;
    let mediaType = req.body.mediaType;
    let musicUrl = req.body.musicUrl;

    // Handle media file upload if file is provided
    const mediaFile = req.files?.file?.[0];
    if (mediaFile) {
      try {
        const isVideo = mediaFile.mimetype.startsWith('video/');
        const result = await uploadMediaFromPath(mediaFile.path, {
          folder: 'chat-app/stories',
          resource_type: isVideo ? 'video' : 'image',
          contentType: mediaFile.mimetype,
          originalFilename: mediaFile.originalname,
        });
        mediaUrl = result.secure_url;
        mediaType = isVideo ? 'video' : 'image';
        fs.unlinkSync(mediaFile.path); // Delete temporary file
      } catch (uploadError) {
        console.error('[Story Controller] Media upload error:', uploadError);
        if (mediaFile && mediaFile.path) {
          fs.unlinkSync(mediaFile.path); // Clean up temp file
        }
        return res.status(500).json({
          success: false,
          message: 'Media upload failed',
        });
      }
    }

    if (!mediaUrl || !mediaType) {
      return res.status(400).json({
        success: false,
        message: 'Media URL and type are required',
      });
    }

    // Handle music file upload if provided
    const musicFile = req.files?.musicFile?.[0];
    if (musicFile) {
      try {
        const result = await uploadMediaFromPath(musicFile.path, {
          folder: 'chat-app/stories/music',
          resource_type: 'video',
          contentType: musicFile.mimetype,
          originalFilename: musicFile.originalname,
        });
        musicUrl = result.secure_url;
        fs.unlinkSync(musicFile.path); // Delete temporary file
      } catch (uploadError) {
        console.error('[Story Controller] Music upload error:', uploadError);
        if (musicFile && musicFile.path) {
          fs.unlinkSync(musicFile.path); // Clean up temp file
        }
        // Don't fail the story creation if music upload fails
      }
    }

    // Calculate expiry date (24 hours from now)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    // Parse sound metadata if provided
    let soundData = null;
    if (sound) {
      try {
        soundData = typeof sound === 'string' ? JSON.parse(sound) : sound;
      } catch (e) {
        console.error('[Story Controller] Error parsing sound data:', e);
      }
    }

    const storyData = {
      user: userId,
      mediaUrl,
      mediaType,
      caption: caption || '',
      privacy: privacy || 'public',
      expiresAt,
      musicUrl: musicUrl || null,
      musicStartTime: musicStartTime || 0,
      musicEndTime: musicEndTime || null,
      location: location || null,
      taggedUsers: taggedUsers || [],
      sound: soundData || undefined,
      videoVolume: (videoVolume != null && videoVolume !== '') ? Math.max(0, Math.min(1, Number(videoVolume))) : 1,
      musicVolume: (musicVolume != null && musicVolume !== '') ? Math.max(0, Math.min(1, Number(musicVolume))) : 1,
    };

    const story = await Story.create(storyData);

    // Populate user data
    await story.populate('user', 'name email profileImage');

    res.status(201).json({
      success: true,
      message: 'Story created successfully',
      data: story,
    });
  } catch (error) {
    console.error('[Story Controller] Error creating story:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create story',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
};

// Helper: group stories by user, add hasViewed, sort (unviewed first, then by latest)
async function groupStoriesByUserAndSort(stories, currentUserId) {
  if (!stories || stories.length === 0) return [];
  const storiesByUser = {};
  stories.forEach(story => {
    const ownerId = story.user?._id?.toString() || story.user?.toString();
    if (!ownerId) return;
    if (!storiesByUser[ownerId]) {
      storiesByUser[ownerId] = { user: story.user, stories: [], hasViewed: false };
    }
    storiesByUser[ownerId].stories.push(story);
  });
  Object.keys(storiesByUser).forEach(ownerId => {
    storiesByUser[ownerId].stories.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  });
  for (const ownerId of Object.keys(storiesByUser)) {
    const storyIds = storiesByUser[ownerId].stories.map(s => s._id);
    const hasViewed = await StoryInteraction.exists({
      story: { $in: storyIds },
      viewer: currentUserId,
      type: 'view',
    });
    storiesByUser[ownerId].hasViewed = !!hasViewed;
  }
  return Object.values(storiesByUser).sort((a, b) => {
    const aLatest = new Date(a.stories[a.stories.length - 1].createdAt);
    const bLatest = new Date(b.stories[b.stories.length - 1].createdAt);
    if (a.hasViewed !== b.hasViewed) return a.hasViewed ? 1 : -1;
    return bLatest - aLatest;
  });
}

// Get stories for the current user's feed — Instagram-style priority:
// Case A: User follows 0 → show only public stories (non-followed, exclude private accounts).
// Case B: User follows 1+ → show followed users' stories first; if they have any, return only those;
//         if none, fallback to public stories.
export const getStoriesFeed = async (req, res) => {
  try {
    const userId = req.user._id;
    const now = new Date();

    const friendships = await FriendRequest.find({
      $or: [
        { fromUser: userId, status: 'accepted' },
        { toUser: userId, status: 'accepted' }
      ]
    }).select('fromUser toUser');

    const followingIds = [...new Set(friendships.map(f => {
      const from = f.fromUser.toString();
      const _to = f.toUser.toString();
      return from === userId.toString() ? f.toUser : f.fromUser;
    }).map(id => new mongoose.Types.ObjectId(id.toString())))];

    // Step 1: If user follows 1+ users, get stories from followed users (not expired)
    let feedStories = [];
    if (followingIds.length > 0) {
      const followedStories = await Story.find({
        user: { $in: followingIds },
        isActive: true,
        isRemoved: { $ne: true },
        expiresAt: { $gt: now },
      })
        .populate('user', 'name profileImage subscription accountType')
        .sort({ createdAt: -1 })
        .lean();

      for (const story of followedStories) {
        const owner = story.user;
        if (!owner) continue;
        const isPrivateAccount = owner.accountType === 'private';
        if (story.privacy === 'public') {
          feedStories.push(story);
        } else if (story.privacy === 'followers' || story.privacy === 'close_friends') {
          if (isPrivateAccount) {
            const isAccepted = followingIds.some(fid => fid.toString() === owner._id.toString());
            if (isAccepted) feedStories.push(story);
          } else {
            feedStories.push(story);
          }
        }
      }

      if (feedStories.length > 0) {
        const storiesArray = await groupStoriesByUserAndSort(feedStories, userId);
        return res.status(200).json({ success: true, data: storiesArray });
      }
    }

    // Case A (0 following) or Case B fallback: public stories from non-followed users, exclude private accounts
    const excludeUserIds = [...followingIds, new mongoose.Types.ObjectId(userId)];
    const publicStories = await Story.aggregate([
      { $match: { privacy: 'public', isActive: true, isRemoved: { $ne: true }, expiresAt: { $gt: now }, user: { $nin: excludeUserIds } } },
      { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'userDoc' } },
      { $unwind: '$userDoc' },
      { $match: { 'userDoc.accountType': 'public' } },
      { $addFields: { user: { _id: '$userDoc._id', name: '$userDoc.name', profileImage: '$userDoc.profileImage', subscription: '$userDoc.subscription', accountType: '$userDoc.accountType' } } },
      { $project: { userDoc: 0 } },
      { $sort: { createdAt: -1 } },
    ]);
    const storiesArray = await groupStoriesByUserAndSort(publicStories, userId);

    res.status(200).json({
      success: true,
      data: storiesArray,
    });
  } catch (error) {
    console.error('[Story Controller] Error fetching stories feed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch stories',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
};

// Get a single story by ID
export const getStoryById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const story = await Story.findById(id)
      .populate('user', 'name profileImage')
      .populate('taggedUsers', 'name profileImage');

    if (!story) {
      return res.status(404).json({
        success: false,
        message: 'Story not found',
      });
    }

    // Check if user can view story
    const canView = await story.canView(userId);
    if (!canView) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view this story',
      });
    }

    res.status(200).json({
      success: true,
      data: story,
    });
  } catch (error) {
    console.error('[Story Controller] Error fetching story:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch story',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
};

// View a story (record interaction)
export const viewStory = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const { duration } = req.body;

    const story = await Story.findById(id);
    if (!story) {
      return res.status(404).json({
        success: false,
        message: 'Story not found',
      });
    }

    // Check if already viewed - use findOne directly to avoid potential static method issues
    const existingView = await StoryInteraction.findOne({
      story: id,
      viewer: userId,
      type: 'view',
    });

    if (!existingView) {
      // Create view interaction
      try {
        const storyRef = mongoose.Types.ObjectId.isValid(id)
          ? new mongoose.Types.ObjectId(String(id))
          : id;
        const viewInteraction = await StoryInteraction.create({
          story: storyRef,
          viewer: userId,
          type: 'view',
          duration: duration || 0,
        });

        console.log('[Story Controller] View interaction created:', {
          storyId: id,
          viewerId: userId.toString(),
          interactionId: viewInteraction._id,
        });

        // Increment view count and record in Story.views (seen tracking)
        story.viewCount += 1;
        await story.save();
        await Story.updateOne(
          { _id: id },
          { $push: { views: { user: userId, viewedAt: new Date() } } }
        );

        const ownerRef = story.user?._id ?? story.user;
        const ownerId = ownerRef ? ownerRef.toString() : null;
        if (ownerId && ownerId !== userId.toString()) {
          await pushStoryViewersUpdatedToOwner(ownerId, id);
        }
      } catch (createError) {
        // Handle duplicate key error (race condition)
        if (createError.code === 11000) {
          console.log('[Story Controller] Duplicate view detected (race condition)');
          // Already viewed, just return success
          return res.status(200).json({
            success: true,
            message: 'Story viewed',
          });
        }
        throw createError;
      }
    } else {
      console.log('[Story Controller] Story already viewed by user');
    }

    res.status(200).json({
      success: true,
      message: 'Story viewed',
    });
  } catch (error) {
    console.error('[Story Controller] Error viewing story:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record story view',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
};

// React to a story (like/emoji)
export const reactToStory = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const { emoji } = req.body;

    const story = await Story.findById(id);
    if (!story) {
      return res.status(404).json({
        success: false,
        message: 'Story not found',
      });
    }

    // Check if already reacted
    const hasReacted = await StoryInteraction.hasInteracted(id, userId, 'like');
    if (!hasReacted) {
      const storyRef = mongoose.Types.ObjectId.isValid(id)
        ? new mongoose.Types.ObjectId(String(id))
        : id;
      await StoryInteraction.create({
        story: storyRef,
        viewer: userId,
        type: 'like',
        emoji: emoji || '❤️',
      });

      story.likeCount += 1;
      await story.save();

      const ownerRef = story.user?._id ?? story.user;
      const ownerId = ownerRef ? ownerRef.toString() : null;

      // Notify story owner (Instagram-style), not when liking own story
      if (ownerId && ownerId !== userId.toString()) {
        try {
          const liker = await User.findById(userId).select('name username').lean();
          const likerName = liker?.name?.trim() || liker?.username?.trim() || 'Someone';
          await createNotification(
            ownerId,
            'like',
            'Story like',
            `${likerName} liked your story.`,
            null,
            null,
            `/user/profile/${userId}`,
            userId
          );
        } catch (notifErr) {
          console.error('[Story Controller] Error creating story like notification:', notifErr);
        }
        await pushStoryViewersUpdatedToOwner(ownerId, id);
      }
    }

    res.status(200).json({
      success: true,
      message: 'Story reacted',
    });
  } catch (error) {
    console.error('[Story Controller] Error reacting to story:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to react to story',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
};

// Reply to a story
export const replyToStory = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const { message } = req.body;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Reply message is required',
      });
    }

    const story = await Story.findById(id);
    if (!story) {
      return res.status(404).json({
        success: false,
        message: 'Story not found',
      });
    }

    await StoryInteraction.create({
      story: id,
      viewer: userId,
      type: 'reply',
      replyMessage: message.trim(),
    });

    story.replyCount += 1;
    await story.save();

    // TODO: Create a chat message or notification for the story owner

    res.status(200).json({
      success: true,
      message: 'Reply sent',
    });
  } catch (error) {
    console.error('[Story Controller] Error replying to story:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reply to story',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
};

// Get story viewers
export const getStoryViewers = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const story = await Story.findById(id);
    if (!story) {
      return res.status(404).json({
        success: false,
        message: 'Story not found',
      });
    }

    // Only story owner can see viewers
    if (story.user.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only story owner can view viewers list',
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid story id',
      });
    }

    const storyOid = new mongoose.Types.ObjectId(String(id));
    const ixColl = StoryInteraction.collection.name;
    const usersColl = User.collection.name;

    // Join view rows to like rows in the DB (same viewer + story + type like) so hasLiked cannot drift from JS id string matching.
    const pipeline = [
      { $match: { story: storyOid, type: 'view' } },
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from: ixColl,
          let: { viewerId: '$viewer' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$story', storyOid] },
                    { $eq: ['$type', 'like'] },
                    { $eq: ['$viewer', '$$viewerId'] },
                  ],
                },
              },
            },
            { $limit: 1 },
          ],
          as: 'likeMatch',
        },
      },
      {
        $lookup: {
          from: usersColl,
          localField: 'viewer',
          foreignField: '_id',
          as: 'viewerUser',
        },
      },
      {
        $addFields: {
          viewerDoc: { $arrayElemAt: ['$viewerUser', 0] },
        },
      },
      {
        $project: {
          _id: 1,
          viewedAt: { $ifNull: ['$viewedAt', '$createdAt'] },
          duration: { $ifNull: ['$duration', 0] },
          hasLiked: { $gt: [{ $size: '$likeMatch' }, 0] },
          emoji: { $arrayElemAt: ['$likeMatch.emoji', 0] },
          viewer: {
            $cond: {
              if: { $ne: ['$viewerDoc', null] },
              then: {
                _id: '$viewerDoc._id',
                name: '$viewerDoc.name',
                username: '$viewerDoc.username',
                profileImage: '$viewerDoc.profileImage',
              },
              else: {
                _id: '$viewer',
                name: 'Deleted',
                username: '',
                profileImage: null,
              },
            },
          },
        },
      },
    ];

    let viewersList = await StoryInteraction.aggregate(pipeline);

    viewersList = viewersList.map((row) => ({
      ...row,
      hasLiked: Boolean(row.hasLiked),
      emoji: row.emoji || null,
    }));

    const likes = await StoryInteraction.find({ story: storyOid, type: 'like' })
      .select('viewer emoji createdAt _id')
      .lean();

    const seenViewerIds = new Set(
      viewersList.map((row) => (row.viewer?._id ? String(row.viewer._id) : '')).filter(Boolean)
    );

    const orphanLikeIds = [
      ...new Set(likes.map((l) => String(l.viewer)).filter((vid) => vid && !seenViewerIds.has(vid))),
    ];

    if (orphanLikeIds.length > 0) {
      const orphanOids = orphanLikeIds.map((x) => new mongoose.Types.ObjectId(x));
      const orphanUsers = await User.find({ _id: { $in: orphanOids } })
        .select('name username profileImage')
        .lean();
      const userById = new Map(orphanUsers.map((u) => [String(u._id), u]));
      for (const l of likes) {
        const vid = String(l.viewer);
        if (seenViewerIds.has(vid)) continue;
        const u = userById.get(vid);
        if (!u) continue;
        viewersList.push({
          _id: l._id,
          viewer: u,
          viewedAt: l.createdAt,
          duration: 0,
          hasLiked: true,
          emoji: l.emoji || '❤️',
        });
        seenViewerIds.add(vid);
      }
    }

    viewersList.sort((a, b) => new Date(b.viewedAt) - new Date(a.viewedAt));

    const fresh = await Story.findById(storyOid).select('viewCount likeCount').lean();

    res.status(200).json({
      success: true,
      data: {
        viewers: viewersList,
        viewCount: fresh?.viewCount ?? viewersList.length,
        likeCount: fresh?.likeCount ?? likes.length,
      },
    });
  } catch (error) {
    console.error('[Story Controller] Error fetching story viewers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch story viewers',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
};

// Delete a story
export const deleteStory = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const story = await Story.findById(id);
    if (!story) {
      return res.status(404).json({
        success: false,
        message: 'Story not found',
      });
    }

    // Only story owner can delete
    if (story.user.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own stories',
      });
    }

    story.isActive = false;
    await story.save();

    res.status(200).json({
      success: true,
      message: 'Story deleted successfully',
    });
  } catch (error) {
    console.error('[Story Controller] Error deleting story:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete story',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
};

// Archive a story
export const archiveStory = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const story = await Story.findById(id);
    if (!story) {
      return res.status(404).json({
        success: false,
        message: 'Story not found',
      });
    }

    // Only story owner can archive
    if (story.user.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only archive your own stories',
      });
    }

    story.isActive = false;
    story.isRemoved = true;
    story.removedBy = userId;
    story.removedAt = new Date();
    story.removalReason = 'archived';
    await story.save();

    return res.status(200).json({
      success: true,
      message: 'Story archived successfully',
    });
  } catch (error) {
    console.error('[Story Controller] Error archiving story:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to archive story',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
};

// Get user's own stories
export const getMyStories = async (req, res) => {
  try {
    const userId = req.user._id;
    const now = new Date();

    const stories = await Story.find({
      user: userId,
      isActive: true,
      expiresAt: { $gt: now },
    })
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      data: stories,
    });
  } catch (error) {
    console.error('[Story Controller] Error fetching user stories:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch your stories',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
};

