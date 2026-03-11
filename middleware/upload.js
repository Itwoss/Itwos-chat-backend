import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit (for videos)
  },
  fileFilter: (req, file, cb) => {
    // Accept images, videos, audio files, and common file types
    const allowedMimes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'video/mp4',
      'video/mpeg',
      'video/quicktime',
      'video/x-msvideo',
      'video/webm',
      'audio/mpeg',
      'audio/mp3',
      'audio/wav',
      'audio/ogg',
      'audio/m4a',
      'audio/aac',
      'audio/webm',
      'audio/mp4',
      'audio/x-m4a',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'application/zip',
      'application/x-zip-compressed',
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images, videos, and documents are allowed.'), false);
    }
  },
});

export const uploadSingle = upload.single('file');
export const uploadMultiple = upload.array('files', 10); // Max 10 files
/** For create post: files array + optional video thumbnail image */
export const uploadForPost = upload.fields([
  { name: 'files', maxCount: 10 },
  { name: 'videoThumbnail', maxCount: 1 },
]);
export const uploadFields = upload.fields([
  { name: 'file', maxCount: 1 }, // Media file (image/video)
  { name: 'musicFile', maxCount: 1 }, // Music file (optional)
]);
/** For memories: images only, max 10 */
export const uploadForMemory = upload.fields([
  { name: 'files', maxCount: 10 },
]);

export default upload;

