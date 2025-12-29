import Post from '../models/Post.js';
import User from '../models/User.js';
import FriendRequest from '../models/FriendRequest.js';
import { validationResult } from 'express-validator';
import cloudinary from '../utils/cloudinary.js';
import fs from 'fs';
import mongoose from 'mongoose';
import { addCount } from '../services/countService.js';

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
    const { content, sound } = req.body;
    const files = req.files || [];

    // Allow posts with content, images, or song (at least one must be present)
    const hasContent = content && content.trim().length > 0;
    const hasFiles = files && files.length > 0;

    if (!hasContent && !hasFiles) {
      return res.status(400).json({
        success: false,
        message: 'Post must have content, images, or a song'
      });
    }

    // Upload images and song to Cloudinary if any
    const imageUrls = [];
    let songUrl = null;

    if (files && files.length > 0) {
      for (const file of files) {
        try {
          // Check if it's an audio file
          const isAudio = file.mimetype.startsWith('audio/');
          const folder = isAudio ? 'chat-app/posts/songs' : 'chat-app/posts';
          
          const result = await cloudinary.uploader.upload(file.path, {
            folder: folder,
            resource_type: isAudio ? 'video' : 'image', // Cloudinary uses 'video' for audio
          });

          if (isAudio) {
            songUrl = result.secure_url;
          } else {
            imageUrls.push(result.secure_url);
          }

          // Delete temporary file
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        } catch (uploadError) {
          console.error('Error uploading file:', uploadError);
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

    const post = await Post.create({
      author: userId,
      content: hasContent ? content.trim() : '',
      images: imageUrls,
      song: songUrl,
      sound: soundData || undefined,
    });

    const populatedPost = await Post.findById(post._id)
      .populate('author', 'name email profileImage accountType subscription')
      .populate('likes', 'name profileImage subscription')
      .populate('comments.user', 'name profileImage subscription');

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

// Get feed posts (posts from friends and public accounts)
export const getFeed = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get user's friends (mutual follows)
    const friendships = await FriendRequest.find({
      $or: [
        { fromUser: userId, status: 'accepted' },
        { toUser: userId, status: 'accepted' }
      ]
    })
      .select('fromUser toUser')
      .lean();

    // Extract friend IDs (deduplicate)
    const friendIds = new Set();
    friendships.forEach(fr => {
      const friendId = fr.fromUser.toString() === userId.toString() 
        ? fr.toUser.toString() 
        : fr.fromUser.toString();
      friendIds.add(friendId);
    });

    // Get public account IDs (excluding friends and self)
    const friendObjectIds = Array.from(friendIds).map(id => new mongoose.Types.ObjectId(id));
    const publicUsers = await User.find({ 
      accountType: 'public',
      _id: { $nin: [userId, ...friendObjectIds] }
    }).select('_id').lean();
    const publicUserIds = publicUsers.map(u => u._id.toString());

    // Build query: posts from friends OR public accounts OR own posts
    const allAuthorIds = new Set([userId.toString(), ...Array.from(friendIds), ...publicUserIds]);
    
    const query = {
      author: { $in: Array.from(allAuthorIds) },
      isRemoved: { $ne: true } // Exclude removed posts
    };

    const posts = await Post.find(query)
      .populate('author', 'name email profileImage accountType subscription')
      .populate('likes', 'name profileImage subscription')
      .populate('comments.user', 'name profileImage subscription')
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
      message: 'Failed to fetch feed',
      error: error.message
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
      return res.status(403).json({
        success: false,
        message: 'You can only view posts from friends for private accounts'
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
      .populate('likes', 'name profileImage subscription')
      .populate('comments.user', 'name profileImage subscription')
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
    }

    const updatedPost = await Post.findById(postId)
      .populate('author', 'name email profileImage accountType subscription')
      .populate('likes', 'name profileImage subscription')
      .populate('comments.user', 'name profileImage subscription');

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
    const { content } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Comment content is required'
      });
    }

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
      content: content.trim()
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

    const updatedPost = await Post.findById(postId)
      .populate('author', 'name email profileImage accountType subscription')
      .populate('likes', 'name profileImage subscription')
      .populate('comments.user', 'name profileImage subscription');

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

