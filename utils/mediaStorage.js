import {
  buildR2ObjectKey,
  isR2Configured,
  publicUrlForKey,
  r2DeleteObjectKey,
  r2PublicKeyFromUrl,
  r2PutFileFromPath,
} from '../lib/r2Presign.js';

export function assertR2MediaConfigured() {
  if (!isR2Configured()) {
    throw new Error(
      'R2 storage is required. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_BASE_URL.',
    );
  }
}

/** @returns {boolean} */
export function isR2MediaReady() {
  return isR2Configured();
}

/**
 * @param {string} filePath - local path (multer disk)
 * @param {{ folder: string, resource_type?: string, contentType?: string, originalFilename?: string }} opts
 * @returns {Promise<{ secure_url: string, public_id?: string }>}
 */
export async function uploadMediaFromPath(filePath, opts) {
  assertR2MediaConfigured();
  const folder = opts.folder || 'uploads';
  const contentType = opts.contentType || 'application/octet-stream';
  const originalFilename = opts.originalFilename || 'file';

  const key = buildR2ObjectKey({
    folder,
    filename: originalFilename,
    contentType,
  });
  await r2PutFileFromPath({ key, filePath, contentType });
  const secure_url = publicUrlForKey(key);
  return { secure_url, public_id: key };
}

/**
 * Delete object when URL is under this app’s R2 public base.
 * Other origins (e.g. old third-party URLs) are not removed by this call.
 */
export async function deleteStoredMediaUrl(url) {
  if (!url || typeof url !== 'string') return;
  if (!url.startsWith('http')) return;

  const r2Key = r2PublicKeyFromUrl(url);
  if (!r2Key) return;

  try {
    await r2DeleteObjectKey(r2Key);
  } catch (e) {
    console.error('[mediaStorage] R2 delete failed:', e?.message || e);
  }
}
