import { createReadStream } from 'node:fs';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

const MIME_TO_EXT = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'audio/webm': '.webm',
  'audio/ogg': '.ogg',
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'application/pdf': '.pdf',
};

export function getR2Env() {
  return {
    accountId: process.env.R2_ACCOUNT_ID?.trim(),
    accessKeyId: process.env.R2_ACCESS_KEY_ID?.trim(),
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY?.trim(),
    bucket: process.env.R2_BUCKET_NAME?.trim() || process.env.R2_BUCKET?.trim(),
    publicBase: process.env.R2_PUBLIC_BASE_URL?.trim(),
  };
}

export function isR2Configured() {
  const e = getR2Env();
  return !!(e.accountId && e.accessKeyId && e.secretAccessKey && e.bucket && e.publicBase);
}

export function sanitizeUploadFolder(input) {
  if (!input || typeof input !== 'string') return 'uploads';
  const s = input
    .replace(/\\/g, '/')
    .replace(/\.\./g, '')
    .replace(/^\/+/, '')
    .replace(/[^a-zA-Z0-9/_-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 200);
  return s || 'uploads';
}

export function pickExtension(filename, contentType) {
  const extFromName = path.extname(path.basename(filename || ''));
  if (extFromName && extFromName.length <= 10 && /^\.[a-zA-Z0-9]+$/.test(extFromName)) {
    return extFromName.toLowerCase();
  }
  const mime = (contentType || '').split(';')[0].trim().toLowerCase();
  return MIME_TO_EXT[mime] || '.bin';
}

export function buildR2ObjectKey({ folder, filename, contentType }) {
  const safeFolder = sanitizeUploadFolder(folder);
  const ext = pickExtension(filename, contentType);
  const stamp = Date.now();
  const rand = randomBytes(12).toString('hex');
  return `${safeFolder}/${stamp}-${rand}${ext}`;
}

export function getS3Client() {
  const { accountId, accessKeyId, secretAccessKey } = getR2Env();
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

/**
 * Upload a local file to R2 (server-side).
 * @returns {{ secure_url: string, public_id: string }}
 */
export async function r2PutFileFromPath({ key, filePath, contentType }) {
  const { bucket } = getR2Env();
  const client = getS3Client();
  const raw = contentType && String(contentType).trim();
  const ct = raw ? String(raw).split(';')[0].trim() : 'application/octet-stream';
  const Body = createReadStream(filePath);
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body,
      ContentType: ct,
    }),
  );
  return { secure_url: publicUrlForKey(key), public_id: key };
}

/** Upload bytes from memory (migration / tooling). */
export async function r2PutBuffer({ key, buffer, contentType }) {
  const { bucket } = getR2Env();
  const client = getS3Client();
  const raw = contentType && String(contentType).trim();
  const ct = raw ? String(raw).split(';')[0].trim() : 'application/octet-stream';
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: ct,
    }),
  );
  return { secure_url: publicUrlForKey(key), key };
}

export async function r2DeleteObjectKey(key) {
  if (!key || typeof key !== 'string') return;
  const { bucket } = getR2Env();
  const client = getS3Client();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

/** Extract object key if `url` is under this deployment's R2 public base URL. */
export function r2PublicKeyFromUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const base = getR2Env().publicBase?.replace(/\/+$/, '');
  if (!base) return null;
  const noQuery = url.trim().split('?')[0];
  if (!noQuery.startsWith(base)) return null;
  let rest = noQuery.slice(base.length).replace(/^\//, '');
  try {
    rest = decodeURIComponent(rest);
  } catch {
    /* keep encoded */
  }
  return rest || null;
}

/**
 * @param {{ key: string, contentType?: string, expiresIn?: number }} opts
 */
export async function presignR2Put({ key, contentType, expiresIn = 900 }) {
  const { bucket } = getR2Env();
  const client = getS3Client();
  const raw = contentType && String(contentType).trim();
  const ct = raw ? String(raw).split(';')[0].trim() : 'application/octet-stream';

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: ct,
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn });
  return { uploadUrl, contentType: ct };
}

export function publicUrlForKey(key) {
  const { publicBase } = getR2Env();
  const base = publicBase.replace(/\/+$/, '');
  const k = String(key).replace(/^\/+/, '');
  return `${base}/${k}`;
}
