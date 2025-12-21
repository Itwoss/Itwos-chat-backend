import Post from '../models/Post.js';
import User from '../models/User.js';
import { createNotification } from './notificationController.js';
import cloudinary from '../utils/cloudinary.js';

// Get all posts (admin) with filtering
export const getAllPosts = async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', authorId = '', isRemoved = '' } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = {};

    if (search) {
      query.$or = [
        { content: { $regex: search, $options: 'i' } }
      ];
    }

    if (authorId) {
      query.author = authorId;
    }

    if (isRemoved !== '') {
      query.isRemoved = isRemoved === 'true';
    }

    const posts = await Post.find(query)
      .populate('author', 'name email profileImage accountType subscription')
      .populate('likes', 'name profileImage subscription')
      .populate('comments.user', 'name profileImage subscription')
      .populate('removedBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

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
    console.error('[Admin Post Controller] Error fetching posts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch posts',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Get single post by ID (admin)
export const getPostById = async (req, res) => {
  try {
    const { id } = req.params;

    const post = await Post.findById(id)
      .populate('author', 'name email profileImage accountType subscription')
      .populate('likes', 'name profileImage subscription')
      .populate('comments.user', 'name profileImage subscription')
      .populate('removedBy', 'name email')
      .lean();

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    res.status(200).json({
      success: true,
      data: post
    });
  } catch (error) {
    console.error('[Admin Post Controller] Error fetching post:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch post',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Remove post (admin) - violates policy
export const removePost = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, warnUser = true } = req.body;
    const adminId = req.user._id;

    if (!reason || reason.trim().length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Removal reason must be at least 10 characters'
      });
    }

    const post = await Post.findById(id).populate('author');
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    if (post.isRemoved) {
      return res.status(400).json({
        success: false,
        message: 'Post is already removed'
      });
    }

    const author = await User.findById(post.author._id || post.author);
    if (!author) {
      return res.status(404).json({
        success: false,
        message: 'Post author not found'
      });
    }

    // Mark post as removed
    post.isRemoved = true;
    post.removedBy = adminId;
    post.removedAt = new Date();
    post.removalReason = reason.trim();
    await post.save();

    // Add warning to user if requested
    if (warnUser) {
      if (!author.warnings) {
        author.warnings = [];
      }
      
      author.warnings.push({
        type: 'post',
        reason: reason.trim(),
        contentId: post._id,
        contentType: 'Post',
        warnedBy: adminId,
        warnedAt: new Date()
      });

      await author.save();

      // Create notification for user with warning
      await createNotification(
        author._id,
        'message',
        '⚠️ Post Removed - Policy Violation',
        `Your post has been removed for violating our community guidelines.\n\nReason: ${reason.trim()}\n\nPlease review our community policies to avoid future violations. Repeated violations may result in account restrictions.`,
        null,
        null,
        '/user/profile'
      );
    }

    res.status(200).json({
      success: true,
      message: 'Post removed successfully',
      data: {
        postId: post._id,
        warned: warnUser
      }
    });
  } catch (error) {
    console.error('[Admin Post Controller] Error removing post:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove post',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Restore removed post (admin)
export const restorePost = async (req, res) => {
  try {
    const { id } = req.params;

    const post = await Post.findById(id);
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    if (!post.isRemoved) {
      return res.status(400).json({
        success: false,
        message: 'Post is not removed'
      });
    }

    post.isRemoved = false;
    post.removedBy = undefined;
    post.removedAt = undefined;
    post.removalReason = undefined;
    await post.save();

    res.status(200).json({
      success: true,
      message: 'Post restored successfully'
    });
  } catch (error) {
    console.error('[Admin Post Controller] Error restoring post:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to restore post',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Permanently delete post (admin) - removes from database
export const deletePostPermanently = async (req, res) => {
  try {
    const { id } = req.params;

    const post = await Post.findById(id);
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
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

    await Post.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Post permanently deleted'
    });
  } catch (error) {
    console.error('[Admin Post Controller] Error deleting post:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete post',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Warn user without removing post
export const warnUserForPost = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const adminId = req.user._id;

    if (!reason || reason.trim().length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Warning reason must be at least 10 characters'
      });
    }

    const post = await Post.findById(id).populate('author');
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    const author = await User.findById(post.author._id || post.author);
    if (!author) {
      return res.status(404).json({
        success: false,
        message: 'Post author not found'
      });
    }

    // Add warning to user
    if (!author.warnings) {
      author.warnings = [];
    }
    
    author.warnings.push({
      type: 'post',
      reason: reason.trim(),
      contentId: post._id,
      contentType: 'Post',
      warnedBy: adminId,
      warnedAt: new Date()
    });

    await author.save();

    // Create notification for user
    await createNotification(
      author._id,
      'message',
      'Content Warning',
      `Your post has been flagged for review. Reason: ${reason.trim()}. Please ensure your content follows our community guidelines.`,
      null,
      null,
      '/user/feed'
    );

    res.status(200).json({
      success: true,
      message: 'User warned successfully',
      data: {
        warningsCount: author.warnings.length
      }
    });
  } catch (error) {
    console.error('[Admin Post Controller] Error warning user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to warn user',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Get post statistics (admin)
export const getPostStats = async (req, res) => {
  try {
    const [
      totalPosts,
      removedPosts,
      postsWithImages,
      postsWithSongs,
      totalLikes,
      totalComments,
      recentPosts
    ] = await Promise.all([
      Post.countDocuments(),
      Post.countDocuments({ isRemoved: true }),
      Post.countDocuments({ images: { $exists: true, $ne: [] } }),
      Post.countDocuments({ song: { $exists: true, $ne: null } }),
      Post.aggregate([
        { $project: { likesCount: { $size: { $ifNull: ['$likes', []] } } } },
        { $group: { _id: null, total: { $sum: '$likesCount' } } }
      ]).then(result => result[0]?.total || 0),
      Post.aggregate([
        { $project: { commentsCount: { $size: { $ifNull: ['$comments', []] } } } },
        { $group: { _id: null, total: { $sum: '$commentsCount' } } }
      ]).then(result => result[0]?.total || 0),
      Post.countDocuments({
        createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      })
    ]);

    res.status(200).json({
      success: true,
      data: {
        total: totalPosts,
        removed: removedPosts,
        active: totalPosts - removedPosts,
        withImages: postsWithImages,
        withSongs: postsWithSongs,
        totalLikes,
        totalComments,
        recent: recentPosts
      }
    });
  } catch (error) {
    console.error('[Admin Post Controller] Error fetching stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch post statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

