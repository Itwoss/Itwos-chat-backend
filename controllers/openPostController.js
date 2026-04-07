import Post from '../models/Post.js';
import User from '../models/User.js';

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Avoid using pasted docs / code as link preview (WhatsApp shows og:title prominently). */
function isUnsuitablePreviewText(s) {
  if (s == null || typeof s !== 'string') return true;
  const t = s.trim();
  if (!t) return true;
  if (/KeyValueStore|storing and retrieving values|associat(ed)? with keys/i.test(t)) return true;
  if (t.length > 200 && (/function\s*\(|=>|\bimport\s|\bexport\s|\bconst\s+\w+\s*=/i.test(t))) return true;
  return false;
}

function buildOgTitle(post, authorName) {
  const raw = post.title && String(post.title).trim();
  if (raw && !isUnsuitablePreviewText(raw)) return raw.slice(0, 90);
  const name = authorName && String(authorName).trim();
  return name ? `Post · ${name.slice(0, 40)}` : 'Post on ITWOS';
}

function buildOgDescription(post) {
  const raw = post.content && String(post.content).replace(/\s+/g, ' ').trim();
  if (raw && !isUnsuitablePreviewText(raw) && raw.length <= 220) return raw.slice(0, 200);
  return 'Open in ITWOS to view this post.';
}

/**
 * Public HTML for link previews (WhatsApp, iMessage, etc.) + browser redirect to the web app.
 * No auth. Only non-archived posts from public accounts (same bar as typical public share).
 */
export const getOpenPostLandingHtml = async (req, res) => {
  try {
    const { postId } = req.params;
    const frontendBase = (process.env.FRONTEND_WEB_URL || process.env.FRONTEND_URL || 'https://www.itwos.store')
      .replace(/\/+$/, '');

    const post = await Post.findById(postId).lean();
    if (!post || post.isRemoved) {
      return res.status(404).type('html').send('<!DOCTYPE html><html><body>Post not found</body></html>');
    }
    if (post.isArchived) {
      return res.status(404).type('html').send('<!DOCTYPE html><html><body>Post not available</body></html>');
    }

    const authorId = post.author?.toString?.() || post.author;
    const author = await User.findById(authorId).select('name accountType').lean();
    if (!author || author.accountType === 'private') {
      return res.status(404).type('html').send('<!DOCTYPE html><html><body>Post not available</body></html>');
    }

    const authorName = author.name || 'ITWOS';
    const title = buildOgTitle(post, authorName);
    const desc = buildOgDescription(post);
    const image =
      (post.images && post.images[0]) ||
      post.videoThumbnail ||
      post.sound?.thumbnail ||
      `${frontendBase}/favicon.ico`;

    const canonical = `${frontendBase}/user/post/${postId}`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <link rel="canonical" href="${escapeHtml(canonical)}" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(desc)}" />
  <meta property="og:image" content="${escapeHtml(image)}" />
  <meta property="og:url" content="${escapeHtml(canonical)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(desc)}" />
  <meta name="twitter:image" content="${escapeHtml(image)}" />
  <meta http-equiv="refresh" content="0;url=${escapeHtml(canonical)}" />
  <style>body{font-family:system-ui,-apple-system,sans-serif;background:#0f0f10;color:#fafafa;margin:0;padding:24px;text-align:center}a{color:#a78bfa}</style>
</head>
<body>
  <p>Opening post…</p>
  <p><a href="${escapeHtml(canonical)}">Continue in ITWOS</a></p>
  <script>window.location.replace(${JSON.stringify(canonical)});</script>
</body>
</html>`;

    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.status(200).type('html').send(html);
  } catch (e) {
    return res.status(500).type('html').send('<!DOCTYPE html><html><body>Error</body></html>');
  }
};
