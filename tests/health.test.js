import { describe, it, expect, beforeEach, _afterEach, _vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import healthRoutes from '../routes/healthRoutes.js';

describe('Health Routes', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use('/api', healthRoutes);
  });

  describe('GET /api/health', () => {
    it('should return 200 and success true', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return message "Backend is running"', async () => {
      const res = await request(app).get('/api/health');
      expect(res.body.message).toBe('Backend is running');
    });

    it('should return a valid ISO timestamp', async () => {
      const res = await request(app).get('/api/health');
      expect(res.body.timestamp).toBeDefined();
      expect(new Date(res.body.timestamp).toISOString()).toBe(res.body.timestamp);
    });

    it('should return environment or "not set"', async () => {
      const res = await request(app).get('/api/health');
      expect(res.body.environment).toBeDefined();
    });

    it('should return cookieConfig with sameSite and secure', async () => {
      const res = await request(app).get('/api/health');
      expect(res.body.cookieConfig).toBeDefined();
      expect(typeof res.body.cookieConfig.sameSite).toBe('string');
      expect(typeof res.body.cookieConfig.secure).toBe('boolean');
    });
  });

  describe('GET /api/test-cookies', () => {
    it('should return 200 and success true', async () => {
      const res = await request(app).get('/api/test-cookies');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return cookies object', async () => {
      const res = await request(app).get('/api/test-cookies');
      expect(res.body.cookies).toBeDefined();
      expect(typeof res.body.cookies).toBe('object');
    });

    it('should return hasUserToken and hasAdminToken booleans', async () => {
      const res = await request(app).get('/api/test-cookies');
      expect(typeof res.body.hasUserToken).toBe('boolean');
      expect(typeof res.body.hasAdminToken).toBe('boolean');
    });
  });
});
