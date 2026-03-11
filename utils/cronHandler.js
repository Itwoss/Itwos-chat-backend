/**
 * Central cron job handler – starts all application cron jobs in one place.
 *
 * Usage:
 *   After server listen: await import('./utils/cronHandler.js'); startAllCronJobs();
 *
 * Env:
 *   CRON_DISABLED=1 or CRON_DISABLED=true – disables all crons (e.g. for worker processes that only serve API).
 *
 * Jobs started:
 *   - Subscription expiry (hourly)
 *   - Story expiry (hourly)
 *   - Count/leaderboard jobs (daily, weekly, monthly)
 */

import { startSubscriptionCron } from './subscriptionCron.js';
import { startStoryCron } from './storyCron.js';
import { startCountCronJobs } from './countCron.js';

const CRON_DISABLED = process.env.CRON_DISABLED === '1' || process.env.CRON_DISABLED === 'true';

/**
 * Start all cron jobs. Safe to call once after server listen.
 */
export function startAllCronJobs() {
  if (CRON_DISABLED) {
    console.log('[CronHandler] Cron jobs are disabled (CRON_DISABLED is set).');
    return;
  }

  try {
    startSubscriptionCron();
    startStoryCron();
    startCountCronJobs();
    console.log('[CronHandler] All cron jobs started.');
  } catch (err) {
    console.error('[CronHandler] Failed to start one or more cron jobs:', err);
  }
}

export { CRON_DISABLED };
