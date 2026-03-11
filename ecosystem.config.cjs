/**
 * PM2 ecosystem config – one Droplet: frontend + 2 backend instances + cron.
 *
 * Repos:
 *   Backend:  https://github.com/Itwoss/Itwos-chat-backend.git  → clone as chat-app-backend
 *   Frontend: https://github.com/Itwoss/itwos-chat-frontend.git → clone as chat-app-frontend
 *
 * Usage on server:
 *   1. Clone both as siblings (see DROPLET_DEPLOYMENT_STEP_BY_STEP.md)
 *   2. In frontend: npm install && npm run build
 *   3. In backend: npm install, add .env
 *   4. From backend dir: pm2 start ecosystem.config.cjs
 *
 * PM2 list will show: chat-app-frontend, chat-app-backend-5000, chat-app-backend-5001, chat-app-cron
 *
 * Set FRONTEND_PATH if your frontend repo is not ../chat-app-frontend
 */

const path = require('path');

const backendDir = path.resolve(__dirname);
const frontendDir = process.env.FRONTEND_PATH || path.join(__dirname, '..', 'chat-app-frontend');

module.exports = {
  apps: [
    {
      name: 'chat-app-frontend',
      cwd: frontendDir,
      script: 'npx',
      args: ['serve', '-s', 'dist', '-l', '3000'],
      interpreter: 'none',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'chat-app-backend-5000',
      cwd: backendDir,
      script: 'server.js',
      interpreter: 'node',
      env: {
        PORT: 5000,
        CRON_DISABLED: '1',
      },
    },
    {
      name: 'chat-app-backend-5001',
      cwd: backendDir,
      script: 'server.js',
      interpreter: 'node',
      env: {
        PORT: 5001,
        CRON_DISABLED: '1',
      },
    },
    {
      name: 'chat-app-cron',
      cwd: backendDir,
      script: 'cron.js',
      interpreter: 'node',
      env: {
        CRON_DISABLED: '0',
      },
    },
  ],
};
