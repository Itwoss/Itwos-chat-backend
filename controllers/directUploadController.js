/**
 * Browser direct uploads → Cloudflare R2 only (presigned PUT).
 * Requires full R2 env; bytes never pass through this API except the small JSON config response.
 */

import {
  buildR2ObjectKey,
  isR2Configured,
  presignR2Put,
  publicUrlForKey,
} from '../lib/r2Presign.js';

/**
 * Unified config for one upload attempt (fresh presigned URL each call).
 * Query: folder, contentType, filename (optional; used for extension / key layout).
 */
export const getUnifiedDirectUploadConfig = async (req, res) => {
  try {
    if (!isR2Configured()) {
      return res.status(503).json({
        success: false,
        message:
          'R2 direct upload is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_BASE_URL.',
      });
    }

    const folder = req.query.folder;
    const contentType = req.query.contentType || 'application/octet-stream';
    const filename = req.query.filename || 'file';
    const key = buildR2ObjectKey({ folder, filename, contentType });
    const { uploadUrl, contentType: ct } = await presignR2Put({ key, contentType });
    const publicUrl = publicUrlForKey(key);

    return res.status(200).json({
      success: true,
      data: {
        provider: 'r2',
        method: 'PUT',
        uploadUrl,
        publicUrl,
        headers: { 'Content-Type': ct },
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Failed to resolve direct upload config',
      error: err?.message,
    });
  }
};
