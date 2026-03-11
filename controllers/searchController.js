import User from '../models/User.js';
import Post from '../models/Post.js';
import SupportTicket from '../models/SupportTicket.js';

/**
 * GET /api/search?q=query&type=users|posts|tickets&limit=10
 * Global search: users (name/email), posts (content), support tickets (subject/message) for current user.
 * Requires authentication.
 */
export const globalSearch = async (req, res) => {
  try {
    const { q, type, limit = 10 } = req.query;
    const query = (typeof q === 'string' ? q : String(q || '')).trim();
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50);
    const searchType = type === 'users' || type === 'posts' || type === 'tickets' ? type : null;

    const results = { users: [], posts: [], tickets: [] };
    const counts = { total: 0, users: 0, posts: 0, tickets: 0 };

    if (!query || query.length < 2) {
      return res.status(200).json({
        success: true,
        data: { results, counts },
      });
    }

    let regex;
    try {
      regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    } catch {
      return res.status(200).json({ success: true, data: { results, counts } });
    }

    const runUsers = !searchType || searchType === 'users';
    const runPosts = !searchType || searchType === 'posts';
    const runTickets = !searchType || searchType === 'tickets';

    if (runUsers) {
      const userDocs = await User.find({
        role: 'user',
        isActive: { $ne: false },
        $or: [{ name: regex }, { email: regex }],
      })
        .select('name email profileImage subscription.badgeType')
        .limit(limitNum)
        .lean();

      results.users = userDocs.map((u) => ({
        id: u._id.toString(),
        name: u.name,
        email: u.email,
        profileImage: u.profileImage,
        badgeType: u.subscription?.badgeType || null,
      }));
      counts.users = results.users.length;
    }

    if (runPosts) {
      const authorIds = await User.find({ role: 'user', name: regex }).select('_id').limit(20).lean().then((docs) => docs.map((d) => d._id));
      const isHashtagQuery = query.startsWith('#');
      const tagSearch = isHashtagQuery ? query.replace(/^#/, '').trim().toLowerCase() : null;
      const postQuery = {
        isRemoved: { $ne: true },
        ...(tagSearch
          ? { hashtags: tagSearch }
          : authorIds.length > 0
            ? { $or: [{ content: regex }, { title: regex }, { author: { $in: authorIds } }] }
            : { $or: [{ content: regex }, { title: regex }] }),
      };
      const postDocs = await Post.find(postQuery)
        .populate('author', 'name profileImage subscription.badgeType')
        .sort({ createdAt: -1 })
        .limit(limitNum)
        .lean();

      const seenPostIds = new Set();
      results.posts = (postDocs || []).filter((p) => {
        const id = p._id.toString();
        if (seenPostIds.has(id)) return false;
        seenPostIds.add(id);
        return true;
      }).map((p) => ({
        id: p._id.toString(),
        content: p.content || '',
        author: p.author
          ? {
              name: p.author.name,
              profileImage: p.author.profileImage,
              badgeType: p.author.subscription?.badgeType || null,
            }
          : { name: 'Unknown', profileImage: null, badgeType: null },
        likes: Array.isArray(p.likes) ? p.likes.length : 0,
        comments: Array.isArray(p.comments) ? p.comments.length : 0,
        hasImages: Array.isArray(p.images) && p.images.length > 0,
        hasSong: !!(p.song && p.song.trim()),
        hasSound: !!(p.sound && (p.sound.video_id || p.sound.title)),
        createdAt: p.createdAt,
      }));
      counts.posts = results.posts.length;
    }

    const userId = req.user?._id ?? req.user?.id;
    if (runTickets && userId) {
      const ticketDocs = await SupportTicket.find({
        user: userId,
        $or: [{ subject: regex }, { message: regex }],
      })
        .sort({ createdAt: -1 })
        .limit(limitNum)
        .lean();

      results.tickets = ticketDocs.map((t) => ({
        id: t._id.toString(),
        subject: t.subject,
        message: t.message,
        status: t.status,
        category: t.category,
        priority: t.priority,
        createdAt: t.createdAt,
      }));
      counts.tickets = results.tickets.length;
    }

    counts.total = counts.users + counts.posts + counts.tickets;

    return res.status(200).json({
      success: true,
      data: { results, counts },
    });
  } catch (err) {
    console.error('[SearchController] globalSearch error:', err);
    return res.status(500).json({
      success: false,
      message: 'Search failed',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
};
