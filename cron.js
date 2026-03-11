/**
 * Standalone Cron Service
 *
 * Run this as a separate process (e.g. in its own container or worker) so cron jobs
 * are not running on API servers. Use for microservices deployments.
 *
 * Usage: node cron.js   or   npm run cron
 *
 * Env: Same .env as backend (MONGODB_URI required). Do not set CRON_DISABLED
 *      when running this service.
 */

import './loadEnv.js';
import mongoose from 'mongoose';
import { startAllCronJobs } from './utils/cronHandler.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/chatapp';

async function main() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('[Cron] MongoDB connected');

    startAllCronJobs();
    console.log('[Cron] Service running. Cron jobs are scheduled. (Ctrl+C to exit)');
  } catch (err) {
    console.error('[Cron] Startup failed:', err);
    process.exit(1);
  }
}

// Keep process alive and handle shutdown
process.on('SIGINT', async () => {
  console.log('[Cron] Shutting down...');
  await mongoose.disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('[Cron] SIGTERM received, shutting down...');
  await mongoose.disconnect();
  process.exit(0);
});

main();
