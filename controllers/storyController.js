import Story from '../models/Story.js';
import StoryInteraction from '../models/StoryInteraction.js';
import User from '../models/User.js';
import FriendRequest from '../models/FriendRequest.js';
import mongoose from 'mongoose';
import cloudinary from '../utils/cloudinary.js';
import fs from 'fs';

// Create a new story
export const createStory = async (req, res) => {
  try {
    const userId = req.user._id;
    const { caption, privacy, musicStartTime, musicEndTime, location, taggedUsers, sound } = req.body;

    let mediaUrl = req.body.mediaUrl;
    let mediaType = req.body.mediaType;
    let musicUrl = req.body.musicUrl;

    // Handle media file upload if file is provided
    const mediaFile = req.files?.file?.[0];
    if (mediaFile) {
      try {
        const isVideo = mediaFile.mimetype.startsWith('video/');
        const result = await cloudinary.uploader.upload(mediaFile.path, {
          folder: 'chat-app/stories',
          resource_type: isVideo ? 'video' : 'image',
        });
        mediaUrl = result.secure_url;
        mediaType = isVideo ? 'video' : 'image';
        fs.unlinkSync(mediaFile.path); // Delete temporary file
      } catch (uploadError) {
        console.error('[Story Controller] Cloudinary upload error:', uploadError);
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
        const result = await cloudinary.uploader.upload(musicFile.path, {
          folder: 'chat-app/stories/music',
          resource_type: 'video', // Cloudinary uses 'video' for audio
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

// Get stories for the current user's feed
export const getStoriesFeed = async (req, res) => {
  try {
    const userId = req.user._id;
    const now = new Date();

    // Get user's friends/followers
    const friendships = await FriendRequest.find({
      $or: [
        { fromUser: userId, status: 'accepted' },
        { toUser: userId, status: 'accepted' }
      ]
    }).select('fromUser toUser');

    const friendIds = friendships.map(f => {
      const fromUserId = f.fromUser.toString();
      const toUserId = f.toUser.toString();
      return fromUserId === userId.toString() ? f.toUser : f.fromUser;
    });
    
    // Include own user ID
    const allUserIds = [...new Set([...friendIds.map(id => new mongoose.Types.ObjectId(id)), new mongoose.Types.ObjectId(userId)])];

    // Get active stories from friends and self that haven't expired
    const allStories = await Story.find({
      user: { $in: allUserIds },
      isActive: true,
      expiresAt: { $gt: now },
    })
      .populate('user', 'name profileImage subscription')
      .sort({ createdAt: -1 })
      .lean();

    // Filter stories based on privacy settings
    const accessibleStories = [];
    for (const story of allStories) {
      const storyUserId = story.user._id.toString();
      const isOwner = storyUserId === userId.toString();
      
      // Always show own stories
      if (isOwner) {
        accessibleStories.push(story);
        continue;
      }

      // Check privacy settings
      if (story.privacy === 'public') {
        accessibleStories.push(story);
      } else if (story.privacy === 'followers') {
        // Check if current user is a friend/follower of story owner
        const isFriend = friendIds.some(fid => fid.toString() === storyUserId);
        if (isFriend) {
          accessibleStories.push(story);
        }
      } else if (story.privacy === 'close_friends') {
        // For now, treat close_friends same as followers
        // You can implement a separate close friends list later
        const isFriend = friendIds.some(fid => fid.toString() === storyUserId);
        if (isFriend) {
          accessibleStories.push(story);
        }
      }
    }

    // Group stories by user
    const storiesByUser = {};
    accessibleStories.forEach(story => {
      const userIdStr = story.user._id.toString();
      if (!storiesByUser[userIdStr]) {
        storiesByUser[userIdStr] = {
          user: story.user,
          stories: [],
          hasViewed: false,
        };
      }
      storiesByUser[userIdStr].stories.push(story);
    });

    // Sort stories within each user group by creation date (oldest first)
    Object.keys(storiesByUser).forEach(userIdStr => {
      storiesByUser[userIdStr].stories.sort((a, b) => {
        return new Date(a.createdAt) - new Date(b.createdAt);
      });
    });

    // Check which users' stories have been viewed
    for (const userIdStr in storiesByUser) {
      const userStories = storiesByUser[userIdStr].stories;
      const storyIds = userStories.map(s => s._id);
      
      // Check if user has viewed ANY story from this user
      const hasViewed = await StoryInteraction.exists({
        story: { $in: storyIds },
        viewer: userId,
        type: 'view',
      });
      
      storiesByUser[userIdStr].hasViewed = !!hasViewed;
      
      // Debug log
      if (hasViewed) {
        console.log('[Story Controller] User has viewed stories from:', {
          storyOwner: userStories[0]?.user?.name || userIdStr,
          storyCount: storyIds.length,
        });
      }
    }

    // Convert to array and sort: unviewed first (by latest story date), then viewed (by latest story date)
    // This matches Instagram behavior where viewed stories move to the end
    const storiesArray = Object.values(storiesByUser).sort((a, b) => {
      const aLatest = new Date(a.stories[a.stories.length - 1].createdAt);
      const bLatest = new Date(b.stories[b.stories.length - 1].createdAt);
      
      // If one is viewed and one is not, unviewed comes first
      if (a.hasViewed !== b.hasViewed) {
        // unviewed (false) comes before viewed (true)
        const result = a.hasViewed ? 1 : -1;
        return result;
      }
      
      // If both have same viewed status, sort by latest story date (newest first)
      return bLatest - aLatest;
    });

    // Debug log
    console.log('[Story Controller] Stories sorted:', storiesArray.map((s, idx) => ({
      index: idx,
      userName: s.user.name,
      hasViewed: s.hasViewed,
      storyCount: s.stories.length,
    })));

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
        const viewInteraction = await StoryInteraction.create({
          story: id,
          viewer: userId,
          type: 'view',
          duration: duration || 0,
        });

        console.log('[Story Controller] View interaction created:', {
          storyId: id,
          viewerId: userId.toString(),
          interactionId: viewInteraction._id,
        });

        // Increment view count
        story.viewCount += 1;
        await story.save();
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
      await StoryInteraction.create({
        story: id,
        viewer: userId,
        type: 'like',
        emoji: emoji || '❤️',
      });

      story.likeCount += 1;
      await story.save();
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

    const viewers = await StoryInteraction.find({
      story: id,
      type: 'view',
    })
      .populate('viewer', 'name profileImage')
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      data: viewers.map(v => ({
        viewer: v.viewer,
        viewedAt: v.viewedAt,
        duration: v.duration,
      })),
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

