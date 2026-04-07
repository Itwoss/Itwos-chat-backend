import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { uploadSingleMaybe } from '../middleware/upload.js';

describe('uploadSingleMaybe (JSON chat messages)', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.post('/echo', uploadSingleMaybe, (req, res) => {
      res.status(200).json({
        body: req.body,
        hasFile: Boolean(req.file),
      });
    });
  });

  it('preserves JSON body for application/json (shared post send)', async () => {
    const payload = {
      chatId: '674a1b2c3d4e5f6789012345',
      sharedPostPostId: '674a1b2c3d4e5f6789012346',
    };
    const res = await request(app).post('/echo').set('Content-Type', 'application/json').send(payload);

    expect(res.status).toBe(200);
    expect(res.body.body.chatId).toBe(payload.chatId);
    expect(res.body.body.sharedPostPostId).toBe(payload.sharedPostPostId);
    expect(res.body.hasFile).toBe(false);
  });

  it('still accepts JSON with empty object without error', async () => {
    const res = await request(app).post('/echo').set('Content-Type', 'application/json').send({});

    expect(res.status).toBe(200);
    expect(res.body.body).toEqual({});
  });
});
