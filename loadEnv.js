/**
 * Load .env before any other app code runs.
 * Must be the first import in server.js so VAPID and other env vars are available
 * when pushService and other modules load.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '.env');
const result = dotenv.config({ path: envPath });
if (result.error) {
  console.warn('[loadEnv] Could not load .env at', envPath, '—', result.error.message);
}

const lkUrl = process.env.LIVEKIT_URL?.trim();
const lkKey = process.env.LIVEKIT_API_KEY?.trim();
const lkSecret = process.env.LIVEKIT_API_SECRET?.trim();
if (!lkUrl || !lkKey || !lkSecret) {
  console.warn(
    '[loadEnv] LIVEKIT_* is incomplete in this process. Voice/video call tokens will return LIVEKIT_NOT_CONFIGURED.',
    'Expected file:',
    envPath,
    '(If the file has the keys, your shell may have empty LIVEKIT_* set, or the request may be hitting another host.)'
  );
}
