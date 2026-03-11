import express from 'express';
import { isEncryptionKeyLoaded } from '../utils/encryption.js';

const router = express.Router();

// Health check endpoint - no authentication required
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Backend is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'not set',
    encryptionKeyLoaded: isEncryptionKeyLoaded,
    ...(isEncryptionKeyLoaded ? {} : { encryptionHint: 'Set ENCRYPTION_KEY in .env or hosting env (64 hex chars) and restart server. Old messages encrypted with another key will still show as unavailable.' }),
    cookieConfig: {
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      secure: process.env.NODE_ENV === 'production',
    },
    cors: {
      allowedOrigins: [
        'http://localhost:5173',
        'http://192.0.0.2:5173',
        'https://seahorse-app-6oovh.ondigitalocean.app',
        process.env.FRONTEND_URL,
        '*.ondigitalocean.app (all Digital Ocean deployments)'
      ].filter(Boolean),
    }
  });
});

// Cookie test endpoint - shows what cookies the server receives
router.get('/test-cookies', (req, res) => {
  res.json({
    success: true,
    cookies: req.cookies || {},
    cookieHeaders: req.headers.cookie || 'No cookie header',
    hasUserToken: !!req.cookies?.userToken,
    hasAdminToken: !!req.cookies?.adminToken,
    environment: process.env.NODE_ENV || 'not set',
  });
});

export default router;
