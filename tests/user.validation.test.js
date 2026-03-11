import { describe, it, expect, beforeAll, _afterAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import userRoutes from '../routes/userRoutes.js';

// Mock User model so register doesn't hit DB
vi.mock('../models/User.js', () => ({
  default: {
    findOne: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
  },
}));

describe('User routes validation', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/user', userRoutes);
  });

  describe('POST /api/user/register', () => {
    it('should return 400 when name is missing', async () => {
      const res = await request(app)
        .post('/api/user/register')
        .send({
          email: 'test@example.com',
          password: 'password123',
          countryCode: '1',
          phoneNumber: '1234567890',
        });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Validation|valid/);
      expect(res.body.errors).toBeDefined();
    });

    it('should return 400 when email is invalid', async () => {
      const res = await request(app)
        .post('/api/user/register')
        .send({
          name: 'Test User',
          email: 'not-an-email',
          password: 'password123',
          countryCode: '1',
          phoneNumber: '1234567890',
        });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errors).toBeDefined();
    });

    it('should return 400 when password is too short', async () => {
      const res = await request(app)
        .post('/api/user/register')
        .send({
          name: 'Test User',
          email: 'test@example.com',
          password: '12345',
          countryCode: '1',
          phoneNumber: '1234567890',
        });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 400 when phoneNumber is not digits', async () => {
      const res = await request(app)
        .post('/api/user/register')
        .send({
          name: 'Test User',
          email: 'test@example.com',
          password: 'password123',
          countryCode: '1',
          phoneNumber: 'abc',
        });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/user/login', () => {
    it('should return 400 when email is missing', async () => {
      const res = await request(app)
        .post('/api/user/login')
        .send({ password: 'password123' });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 400 when password is missing', async () => {
      const res = await request(app)
        .post('/api/user/login')
        .send({ email: 'test@example.com' });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });
});
