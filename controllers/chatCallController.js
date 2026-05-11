import mongoose from 'mongoose';
import { AccessToken } from 'livekit-server-sdk';
import Chat from '../models/Chat.js';

/**
 * Mint a short-lived LiveKit JWT for a 1:1 DM room.
 * Requires LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET on the server.
 * Room name is deterministic from the two user ids so both peers join the same room.
 */
export async function createLiveKitCallToken(req, res) {
  try {
    const me = req.user?._id;
    if (!me) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { peerUserId, callType = 'video' } = req.body || {};
    if (!peerUserId || !mongoose.isValidObjectId(String(peerUserId))) {
      return res.status(400).json({ success: false, message: 'Valid peerUserId is required' });
    }
    if (String(peerUserId) === String(me)) {
      return res.status(400).json({ success: false, message: 'Invalid peer' });
    }

    const chat = await Chat.findOne({
      participants: { $all: [me, peerUserId] },
      isActive: true,
    })
      .select('_id')
      .lean();

    if (!chat) {
      return res.status(403).json({
        success: false,
        message: 'You can only call someone you have an active chat with.',
      });
    }

    const url = process.env.LIVEKIT_URL?.trim();
    const apiKey = process.env.LIVEKIT_API_KEY?.trim();
    const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();

    if (!url || !apiKey || !apiSecret) {
      return res.status(503).json({
        success: false,
        code: 'LIVEKIT_NOT_CONFIGURED',
        message:
          'Voice/video is not configured on the server. Set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET (see LiveKit Cloud dashboard).',
      });
    }

    const ids = [String(me), String(peerUserId)].sort();
    const roomName = `dm_${ids[0]}_${ids[1]}`;

    const at = new AccessToken(apiKey, apiSecret, {
      identity: String(me),
      name: req.user?.name || req.user?.username || 'User',
      ttl: '15m',
    });

    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();

    return res.json({
      success: true,
      data: {
        url,
        token,
        roomName,
        callType: callType === 'audio' ? 'audio' : 'video',
      },
    });
  } catch (err) {
    console.error('[createLiveKitCallToken]', err);
    return res.status(500).json({
      success: false,
      message: err?.message || 'Failed to create call token',
    });
  }
}
