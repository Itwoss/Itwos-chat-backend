import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { authenticate, authorize } from '../middleware/auth.js';

vi.mock('jsonwebtoken');
vi.mock('../models/User.js', () => ({ default: { findById: vi.fn() } }));

describe('Auth Middleware', () => {
  let app;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, JWT_SECRET: 'test-secret' };
    app = express();
    app.use(express.json());
    app.use(cookieParser());
  });

  describe('authenticate', () => {
    it('should return 401 when no token is provided (no cookies, no Authorization)', async () => {
      app.get('/protected', authenticate, (req, res) => res.json({ ok: true }));
      const res = await request(app).get('/protected');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/login|Authentication/);
    });

    it('should return 401 when cookie has no userToken/adminToken', async () => {
      app.get('/protected', authenticate, (req, res) => res.json({ ok: true }));
      const res = await request(app)
        .get('/protected')
        .set('Cookie', 'other=value');
      expect(res.status).toBe(401);
    });

    it('should accept userToken cookie and call next when token is valid', async () => {
      const mockUser = { _id: 'user123', email: 'u@test.com', role: 'user' };
      jwt.verify.mockReturnValue({ id: 'user123' });
      User.findById.mockReturnValue({ select: vi.fn().mockResolvedValue(mockUser) });

      app.get('/protected', authenticate, (req, res) =>
        res.json({ user: req.user.email })
      );
      const res = await request(app)
        .get('/protected')
        .set('Cookie', 'userToken=fake-jwt');
      expect(res.status).toBe(200);
      expect(res.body.user).toBe('u@test.com');
      expect(jwt.verify).toHaveBeenCalledWith('fake-jwt', 'test-secret');
      expect(User.findById).toHaveBeenCalledWith('user123');
    });

    it('should accept Bearer token in Authorization header', async () => {
      const mockUser = { _id: 'user456', email: 'bearer@test.com', role: 'user' };
      jwt.verify.mockReturnValue({ id: 'user456' });
      User.findById.mockReturnValue({ select: vi.fn().mockResolvedValue(mockUser) });

      app.get('/protected', authenticate, (req, res) =>
        res.json({ user: req.user.email })
      );
      const res = await request(app)
        .get('/protected')
        .set('Authorization', 'Bearer header-token');
      expect(res.status).toBe(200);
      expect(res.body.user).toBe('bearer@test.com');
      expect(jwt.verify).toHaveBeenCalledWith('header-token', 'test-secret');
    });

    it('should return 401 when user is not found in DB', async () => {
      jwt.verify.mockReturnValue({ id: 'nonexistent' });
      User.findById.mockReturnValue({ select: vi.fn().mockResolvedValue(null) });

      app.get('/protected', authenticate, (req, res) => res.json({ ok: true }));
      const res = await request(app)
        .get('/protected')
        .set('Cookie', 'userToken=fake');
      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/User not found|login/);
    });

    it('should return 401 on invalid or expired token', async () => {
      jwt.verify.mockImplementation(() => {
        const err = new Error('invalid');
        err.name = 'JsonWebTokenError';
        throw err;
      });

      app.get('/protected', authenticate, (req, res) => res.json({ ok: true }));
      const res = await request(app)
        .get('/protected')
        .set('Cookie', 'userToken=bad');
      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/Session expired|login/);
    });
  });

  describe('authorize', () => {
    it('should return 401 when req.user is missing', async () => {
      app.get('/admin-only', authorize('admin'), (req, res) => res.json({ ok: true }));
      const res = await request(app).get('/admin-only');
      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/Authentication required/);
    });

    it('should return 403 when user role is not in allowed roles', async () => {
      app.get('/admin-only', (req, res, next) => {
        req.user = { role: 'user' };
        next();
      }, authorize('admin'), (req, res) => res.json({ ok: true }));
      const res = await request(app).get('/admin-only');
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/Access denied|permissions/);
    });

    it('should call next when user role is allowed', async () => {
      app.get('/admin-only', (req, res, next) => {
        req.user = { role: 'admin' };
        next();
      }, authorize('admin'), (req, res) => res.json({ ok: true }));
      const res = await request(app).get('/admin-only');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('should allow multiple roles', async () => {
      app.get('/staff', (req, res, next) => {
        req.user = { role: 'user' };
        next();
      }, authorize('admin', 'user'), (req, res) => res.json({ ok: true }));
      const res = await request(app).get('/staff');
      expect(res.status).toBe(200);
    });
  });
});
