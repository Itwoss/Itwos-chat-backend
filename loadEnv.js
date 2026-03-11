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
if (result.error && process.env.NODE_ENV !== 'production') {
  console.warn('[loadEnv] Could not load .env:', result.error.message);
}
