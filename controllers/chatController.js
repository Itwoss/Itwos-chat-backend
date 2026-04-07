import mongoose from 'mongoose';
import Chat from '../models/Chat.js';
import Message from '../models/Message.js';
import ChatSettings from '../models/ChatSettings.js';
import ChatTheme from '../models/ChatTheme.js';
import UserChatThemePurchase from '../models/UserChatThemePurchase.js';
import UserChatPrefs from '../models/UserChatPrefs.js';
import FriendRequest from '../models/FriendRequest.js';
import User from '../models/User.js';
import Post from '../models/Post.js';

import { createOrder as createRazorpayOrder, verifyPaymentSignature } from '../utils/razorpay.js';
import { createNotification } from './notificationController.js';
import { encryptMessage, decryptMessage } from '../utils/encryption.js';
import { addCount, hashMessage } from '../services/countService.js';

// Get or create chat between two users
export const getOrCreateChat = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user._id;

    if (currentUserId.toString() === userId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot chat with yourself'
      });
    }

    // Check if user exists
    const targetUser = await User.findById(userId).select('accountType role isActive');
    if (!targetUser || targetUser.role === 'admin' || !targetUser.isActive) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // For private accounts, check if users are friends
    if (targetUser.accountType === 'private') {
      const friendship = await FriendRequest.findOne({
        $or: [
          { fromUser: currentUserId, toUser: userId, status: 'accepted' },
          { fromUser: userId, toUser: currentUserId, status: 'accepted' }
        ]
      }).lean(); // Use lean() for faster query

      if (!friendship) {
        return res.status(200).json({
          success: true,
          privateAccount: true,
          message: 'Cannot message this user. They have a private account and you are not friends.'
        });
      }
    }
    // For public accounts, no friend request needed - allow direct messaging

    // Check if chat already exists - optimized query
    let chat = await Chat.findOne({
      participants: { $all: [currentUserId, userId] }
    })
      .populate('lastMessage')
      .populate('participants', 'name email profileImage accountType onlineStatus lastSeen privacySettings subscription')
      .lean();

    if (!chat) {
      // Create new chat
      const newChat = await Chat.create({
        participants: [currentUserId, userId]
      });
      
      // Populate after creation
      chat = await Chat.findById(newChat._id)
        .populate('participants', 'name email profileImage accountType onlineStatus lastSeen privacySettings subscription')
        .lean();
    }

    res.status(200).json({
      success: true,
      data: chat
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get or create chat',
      error: error.message
    });
  }
};

// Get user's chats - optimized with aggregation
export const getUserChats = async (req, res) => {
  try {
    const userId = req.user._id;

    // Use aggregation for better performance
    const chats = await Chat.aggregate([
      {
        $match: {
          participants: userId,
          isActive: true
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'participants',
          foreignField: '_id',
          as: 'participantsData'
        }
      },
      {
        $lookup: {
          from: 'messages',
          localField: 'lastMessage',
          foreignField: '_id',
          as: 'lastMessageData'
        }
      },
      {
        $project: {
          _id: 1,
          lastMessageAt: 1,
          participants: {
            $filter: {
              input: '$participantsData',
              as: 'participant',
              cond: { $ne: ['$$participant._id', userId] }
            }
          },
          lastMessage: { $arrayElemAt: ['$lastMessageData', 0] }
        }
      },
      {
        $unwind: {
          path: '$participants',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $project: {
          _id: 1,
          otherUser: {
            _id: '$participants._id',
            name: '$participants.name',
            email: '$participants.email',
            profileImage: '$participants.profileImage',
            accountType: '$participants.accountType',
            onlineStatus: '$participants.onlineStatus',
            lastSeen: '$participants.lastSeen',
            privacySettings: '$participants.privacySettings',
            subscription: '$participants.subscription'
          },
          lastMessage: 1,
          lastMessageAt: 1
        }
      },
      {
        $sort: { lastMessageAt: -1 }
      }
    ]);

    // Calculate unread counts in parallel - optimized
    const chatIds = chats.map(chat => chat._id);
    const unreadCounts = chatIds.length > 0 ? await Message.aggregate([
      {
        $match: {
          chatId: { $in: chatIds },
          receiver: userId,
          isRead: false,
          isDeleted: false
        }
      },
      {
        $group: {
          _id: '$chatId',
          count: { $sum: 1 }
        }
      }
    ]) : [];

    const unreadMap = new Map(unreadCounts.map(uc => [uc._id.toString(), uc.count]));

    // Decrypt last message content for display in chat list
    const chatsWithOtherUser = chats.map(chat => {
      let decryptedContent = null;
      if (chat.lastMessage) {
        if (chat.lastMessage.messageType === 'post_share') {
          decryptedContent = '📎 Shared a post';
        } else if (chat.lastMessage.isEncrypted && chat.lastMessage.content) {
          try {
            decryptedContent = decryptMessage(chat.lastMessage.content);
          } catch (error) {
            console.error('Error decrypting last message:', error);
            decryptedContent = '[Encrypted Message]';
          }
        } else {
          decryptedContent = chat.lastMessage.content;
        }

        if (chat.lastMessage.messageType === 'image') {
          decryptedContent = '📷 Image';
        } else if (chat.lastMessage.messageType === 'file') {
          decryptedContent = '📎 File';
        }
      }
      
      return {
        ...chat,
        lastMessage: chat.lastMessage ? {
          ...chat.lastMessage,
          content: decryptedContent
        } : null,
        unreadCount: unreadMap.get(chat._id.toString()) || 0
      };
    });

    res.status(200).json({
      success: true,
      data: chatsWithOtherUser
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch chats',
      error: error.message
    });
  }
};

// Get messages for a chat
export const getChatMessages = async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user._id;
    const { page = 1, limit = 50 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Verify user is participant - optimized query
    const chat = await Chat.findById(chatId).select('participants').lean();
    if (!chat || !chat.participants.some(p => p.toString() === userId.toString())) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to view this chat'
      });
    }

    // Exclude messages hidden for this user (delete for me); exclude deleted-for-everyone entirely (unsent for all)
    const messages = await Message.find({
      chatId,
      hiddenFor: { $ne: userId },
      $and: [
        { $or: [{ isDeleted: false }, { deletedForEveryone: false }] },
        { $or: [{ sender: userId }, { receiver: userId }] }
      ]
    })
      .select('sender receiver content messageType attachments sharedPost status isRead readAt deliveredAt isEncrypted createdAt isDeleted deletedForEveryone replyTo')
      .populate('sender', 'name email profileImage')
      .populate('receiver', 'name email profileImage')
      .populate({ path: 'replyTo', select: 'content sender messageType isDeleted deletedForEveryone', populate: { path: 'sender', select: 'name' } })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Decrypt and normalize; replyTo may reference a deleted message (show stub in quote only)
    const sanitizeContent = (str) => {
      if (typeof str !== 'string' || str.length <= 32) return str;
      const isAllHex = /^[a-f0-9:]+$/i.test(str) && !/[\s.,!?'"]/.test(str);
      const longHexMatch = str.match(/[a-f0-9]{48,}/gi);
      const isMostlyHex = longHexMatch && longHexMatch.join('').length > str.length * 0.5;
      return (isAllHex || isMostlyHex) ? '[Message could not be decrypted]' : str;
    };
    const decryptedMessages = messages.map(msg => {
      if (msg.replyTo && msg.replyTo.isDeleted && msg.replyTo.deletedForEveryone) {
        msg.replyTo = { ...msg.replyTo, content: 'This message was deleted' };
      }
      // Decrypt and sanitize replyTo.content so reply quotes never show hex
      if (msg.replyTo && msg.replyTo.content && msg.replyTo.content !== 'This message was deleted') {
        try {
          msg.replyTo.content = decryptMessage(msg.replyTo.content);
        } catch (_) {
          msg.replyTo.content = '[Message could not be decrypted]';
        }
        msg.replyTo.content = sanitizeContent(msg.replyTo.content);
      }
      if (msg.messageType !== 'post_share' && msg.isEncrypted && msg.content) {
        try {
          msg.content = decryptMessage(msg.content);
        } catch (_err) {
          console.error('Decryption error for message:', msg._id);
          msg.content = '[Message could not be decrypted]';
        }
      }
      if (msg.messageType !== 'post_share') {
        msg.content = sanitizeContent(msg.content);
      }
      return msg;
    });

    const total = await Message.countDocuments({
      chatId,
      hiddenFor: { $ne: userId },
      $and: [
        { $or: [{ isDeleted: false }, { deletedForEveryone: false }] },
        { $or: [{ sender: userId }, { receiver: userId }] }
      ]
    });

    // Update message status: delivered -> read (only on first page load)
    if (skip === 0) {
      // Mark as delivered if not already
      await Message.updateMany(
        {
          chatId,
          receiver: userId,
          status: 'sent',
          isDeleted: false
        },
        {
          status: 'delivered',
          deliveredAt: new Date()
        }
      );

      // Mark as read
      await Message.updateMany(
        {
          chatId,
          receiver: userId,
          status: { $in: ['sent', 'delivered'] },
          isRead: false
        },
        {
          status: 'read',
          isRead: true,
          readAt: new Date()
        }
      );
    }

    res.status(200).json({
      success: true,
      data: decryptedMessages.reverse(), // Reverse to show oldest first
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch messages',
      error: error.message
    });
  }
};

function normalizeIdInput(val) {
  if (val == null || val === '') return '';
  if (Array.isArray(val)) return normalizeIdInput(val[0]);
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'object' && val.$oid) return String(val.$oid).trim();
  return String(val).trim();
}

function parseSharedPostNested(body) {
  let sp = body?.sharedPost;
  if (sp == null) return null;
  if (typeof sp === 'string') {
    try {
      sp = JSON.parse(sp);
    } catch {
      return null;
    }
  }
  return typeof sp === 'object' && sp !== null && !Array.isArray(sp) ? sp : null;
}

// Send message
export const sendMessage = async (req, res) => {
  try {
    const senderId = req.user._id;
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    let chatId = normalizeIdInput(body.chatId);
    let content = body.content != null ? String(body.content) : '';
    let messageType =
      typeof body.messageType === 'string' && body.messageType.trim() ? body.messageType.trim() : 'text';
    const replyTo = body.replyTo;
    const allowedTypes = ['text', 'image', 'file', 'audio', 'post_share'];
    if (!allowedTypes.includes(messageType)) messageType = 'text';

    if (!chatId) {
      return res.status(400).json({
        success: false,
        message: 'Chat ID is required and must be a valid string',
      });
    }

    let attachments = [];
    const fs = await import('fs').then(m => m.default);
    const cloudinary = (await import('../utils/cloudinary.js')).default;
    const fileList = (Array.isArray(req.files) && req.files.length > 0)
      ? req.files
      : (req.files?.files && req.files.files.length > 0)
        ? req.files.files
        : req.file
          ? [req.file]
          : [];

    const q = req.query || {};
    const nestedShared = parseSharedPostNested(body);
    const rawSharedPostId =
      normalizeIdInput(body.sharedPostPostId) ||
      normalizeIdInput(q.sharedPostPostId) ||
      normalizeIdInput(body.feedPostId) ||
      normalizeIdInput(q.feedPostId) ||
      normalizeIdInput(body.sharedPostId) ||
      normalizeIdInput(q.sharedPostId) ||
      (nestedShared ? normalizeIdInput(nestedShared.postId) : '');

    let sharedPostSnapshot = null;
    if (rawSharedPostId) {
      if (fileList.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Cannot attach files to a shared post message',
        });
      }
      const pid = String(rawSharedPostId).trim();
      if (!mongoose.Types.ObjectId.isValid(pid)) {
        return res.status(400).json({ success: false, message: 'Invalid post id' });
      }
      const shared = await Post.findById(pid).lean();
      if (!shared || shared.isRemoved) {
        return res.status(404).json({ success: false, message: 'Post not found' });
      }
      const authorId = shared.author?.toString?.() || shared.author;
      const isOwnPost = authorId && authorId.toString() === senderId.toString();
      if (shared.isArchived && !isOwnPost) {
        return res.status(404).json({ success: false, message: 'Post not found' });
      }
      const author = await User.findById(authorId).select('accountType').lean();
      if (!author) {
        return res.status(404).json({ success: false, message: 'Post not found' });
      }
      if (!isOwnPost && author.accountType === 'private') {
        const friendship = await FriendRequest.findOne({
          $or: [
            { fromUser: senderId, toUser: authorId, status: 'accepted' },
            { fromUser: authorId, toUser: senderId, status: 'accepted' },
          ],
        }).lean();
        if (!friendship) {
          return res.status(403).json({
            success: false,
            message: 'You cannot share this post',
          });
        }
      }
      const imageUrl =
        (shared.images && shared.images[0]) ||
        shared.videoThumbnail ||
        (shared.sound && shared.sound.thumbnail) ||
        '';
      const mediaKind = shared.video ? 'video' : shared.images?.length ? 'image' : 'none';
      sharedPostSnapshot = {
        postId: shared._id,
        title: (shared.title && String(shared.title).trim()) || 'Post',
        imageUrl,
        mediaKind,
      };
      messageType = 'post_share';
      content = 'Post';
    }

    if (messageType === 'post_share' && !sharedPostSnapshot) {
      messageType = 'text';
    }

    if (fileList.length > 0) {
      try {
        const allImages = fileList.every(f => f.mimetype && f.mimetype.startsWith('image/'));
        const hasAnyImage = fileList.some(f => f.mimetype && f.mimetype.startsWith('image/'));
        const hasAnyAudio = fileList.some(f => f.mimetype && f.mimetype.startsWith('audio/'));
        // Multi-file: if all images, one iMessage-style message with messageType 'image'
        if (fileList.length > 1 && allImages) {
          messageType = 'image';
        } else if (fileList.length === 1) {
          if (fileList[0].mimetype.startsWith('image/')) messageType = 'image';
          else if (fileList[0].mimetype.startsWith('audio/')) messageType = 'audio';
          else messageType = 'file';
        } else {
          messageType = hasAnyAudio && !hasAnyImage ? 'audio' : hasAnyImage ? 'image' : 'file';
        }

        for (const file of fileList) {
          const result = await cloudinary.uploader.upload(file.path, {
            folder: 'chat-app/messages',
            resource_type: 'auto',
          });
          const type = file.mimetype.startsWith('image/') ? 'image' : file.mimetype.startsWith('audio/') ? 'audio' : 'file';
          attachments.push({
            url: result.secure_url,
            type,
            name: file.originalname,
          });
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        }

        if (!content || content.trim() === '') {
          content = messageType === 'image' ? 'Image' : attachments.map(a => a.name).join(', ');
        }
      } catch (uploadError) {
        console.error('Error uploading file(s):', uploadError);
        return res.status(500).json({
          success: false,
          message: 'Failed to upload file',
          error: uploadError.message
        });
      }
    }

    // Verify chat exists and user is participant - optimized query
    const chat = await Chat.findById(chatId).select('participants').lean();
    if (!chat || !chat.participants.some(p => p.toString() === senderId.toString())) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to send messages in this chat'
      });
    }

    const receiverId = chat.participants.find(p => p.toString() !== senderId.toString());
    if (!receiverId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid chat: could not resolve receiver',
      });
    }

    const skipEncrypt =
      messageType === 'post_share' ||
      !content ||
      content === 'Image' ||
      attachments.some((a) => a.name === content);
    const encryptedContent = skipEncrypt ? content : encryptMessage(content);

    const messagePayload = {
      chatId,
      sender: senderId,
      receiver: receiverId,
      content: encryptedContent,
      messageType,
      attachments,
      status: 'sent',
      isEncrypted: !skipEncrypt && encryptedContent !== content,
    };
    if (sharedPostSnapshot) {
      messagePayload.sharedPost = sharedPostSnapshot;
      messagePayload.isEncrypted = false;
    }
    if (replyTo && typeof replyTo === 'string') {
      messagePayload.replyTo = replyTo;
    }

    let finalContent = String(messagePayload.content ?? '').trim();
    if (!finalContent) {
      if (sharedPostSnapshot) {
        finalContent = 'Post';
        messagePayload.content = 'Post';
      } else {
        return res.status(400).json({
          success: false,
          message: 'Message content is required',
        });
      }
    } else {
      messagePayload.content = finalContent;
    }

    const message = await Message.create(messagePayload);

    // Update chat's last message - optimized with updateOne
    await Chat.updateOne(
      { _id: chatId },
      {
        lastMessage: message._id,
        lastMessageAt: new Date()
      }
    );

    // Populate message and decrypt for response
    const populatedMessage = await Message.findById(message._id)
      .populate('sender', 'name email profileImage')
      .populate('receiver', 'name email profileImage')
      .lean();

    if (
      populatedMessage.messageType !== 'post_share' &&
      populatedMessage.isEncrypted &&
      populatedMessage.content
    ) {
      try {
        populatedMessage.content = decryptMessage(populatedMessage.content);
      } catch (_) {
        populatedMessage.content = '[Message could not be decrypted]';
      }
    }

    // Emit message via Socket.IO so receiver gets it in real time (no refresh needed)
    try {
      const io = req.app?.get('io');
      if (io) {
        const payload = {
          chatId,
          message: { ...populatedMessage, status: 'sent' },
          senderId: senderId.toString(),
        };
        io.to(`user:${receiverId.toString()}`).emit('new-message', payload);
      }
    } catch (emitErr) {
      console.warn('[Chat] Socket emit new-message failed (non-blocking):', emitErr?.message);
    }

    try {
      await createNotification(
        receiverId,
        'message',
        'New Message',
        `${req.user.name} sent you a message`,
        null,
        null,
        `/user/chat/${senderId}`
      );
    } catch (notifErr) {
      console.warn('[sendMessage] createNotification:', notifErr?.message);
    }

    // Always send Web Push (Socket + Push). Required for iOS PWA when app is closed – backend MUST send push on every message.
    try {
      const { sendPushToUser } = await import('../services/pushService.js');
      const bodyText =
        messageType === 'post_share'
          ? 'Shared a post'
          : messageType === 'text' && content && content.trim()
            ? (content.slice(0, 60) + (content.length > 60 ? '…' : ''))
            : messageType === 'image'
              ? (attachments.length > 1 ? `Sent ${attachments.length} photos` : 'Sent a photo')
              : messageType === 'audio'
                ? 'Sent a voice message'
                : 'Sent a message';
      const pushPayload = {
        title: req.user.name || 'New message',
        body: bodyText,
        url: `/user/chat/${senderId}`,
        tag: `chat-${chatId}`,
      };
      console.log('[Chat] Sending push to receiver', receiverId.toString(), '| title:', pushPayload.title, '| url:', pushPayload.url);
      console.log('[Chat] Receiver userId for MongoDB: db.pushsubscriptions.find({ userId: ObjectId("' + receiverId.toString() + '") })');
      const pushResult = await sendPushToUser(receiverId, pushPayload);
      if (pushResult.sent > 0) {
        console.log('[Chat] Push delivered to receiver', receiverId.toString(), '| sent:', pushResult.sent, 'failed:', pushResult.failed);
      } else if (pushResult.failed > 0) {
        console.warn('[Chat] Push to receiver', receiverId.toString(), 'failed for all subscriptions (', pushResult.failed, ')');
      } else {
        console.warn('[Chat] Push not sent: no subscriptions for receiver', receiverId.toString(), '- they must enable notifications on the device that should receive the notification.');
      }
    } catch (pushErr) {
      console.warn('[Chat] Push notification failed (non-blocking):', pushErr?.message);
    }

    if (messageType === 'text' && content && content.trim()) {
      try {
        const messageHash = hashMessage(content);
        await addCount(senderId, 'chat', 1, {
          chatId: chatId,
          messageId: message._id,
          recipientId: receiverId,
          messageHash: messageHash,
          messageText: content
        });
      } catch (countError) {
        // Don't fail the message send if count fails
        console.error('[ChatController] Error adding count:', countError);
      }
    }

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: populatedMessage
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to send message',
      error: error.message
    });
  }
};

// Delete message – Instagram style: delete for me (hide) or delete for everyone (stub for all)
export const deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user._id;
    const deleteForRaw = req.body?.deleteFor ?? req.query?.deleteFor ?? 'me';
    const deleteFor = String(deleteForRaw).toLowerCase().trim(); // 'me' | 'everyone'

    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    const senderIdStr = (message.sender && (message.sender._id || message.sender)).toString();
    const receiverIdStr = (message.receiver && (message.receiver._id || message.receiver)).toString();
    const userIdStr = userId.toString();
    const isSender = senderIdStr === userIdStr;
    const isReceiver = receiverIdStr === userIdStr;
    if (!isSender && !isReceiver) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete messages in your chat'
      });
    }

    if (deleteFor === 'everyone') {
      if (!isSender) {
        return res.status(403).json({
          success: false,
          message: 'Only the sender can delete for everyone'
        });
      }
      message.isDeleted = true;
      message.deletedForEveryone = true;
      message.deletedAt = new Date();
      message.content = 'This message was deleted'; // placeholder so required content validation passes
      message.attachments = [];
      message.messageType = 'text';
      await message.save();
    } else {
      // Delete for me: hide for this user only
      if (!message.hiddenFor) message.hiddenFor = [];
      if (!message.hiddenFor.some(id => id.toString() === userId.toString())) {
        message.hiddenFor.push(userId);
        await message.save();
      }
    }

    res.status(200).json({
      success: true,
      message: 'Message deleted successfully',
      data: { deleteFor }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete message',
      error: error.message
    });
  }
};

// Mark messages as read
export const markMessagesAsRead = async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user._id;

    await Message.updateMany(
      {
        chatId,
        receiver: userId,
        isRead: false
      },
      {
        isRead: true,
        readAt: new Date()
      }
    );

    res.status(200).json({
      success: true,
      message: 'Messages marked as read'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to mark messages as read',
      error: error.message
    });
  }
};

// Get unread message count
export const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user._id;

    const unreadCount = await Message.countDocuments({
      receiver: userId,
      isRead: false,
      hiddenFor: { $ne: userId }
    });

    res.status(200).json({
      success: true,
      data: { unreadCount }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get unread count',
      error: error.message
    });
  }
};

// List chat themes for user (with purchased ids) – free and paid, only active
export const getChatThemes = async (req, res) => {
  try {
    const userId = req.user._id;
    const themes = await ChatTheme.find({ isActive: true }).sort({ sortOrder: 1, createdAt: -1 }).lean();
    const purchased = await UserChatThemePurchase.find({ userId }).select('themeId').lean();
    const purchasedIds = new Set(purchased.map((p) => p.themeId.toString()));
    const data = themes.map((t) => ({
      ...t,
      owned: t.isFree || purchasedIds.has(t._id.toString()),
    }));
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch chat themes',
      error: error.message,
    });
  }
};

// Create Razorpay order for paid chat theme
export const createChatThemeOrder = async (req, res) => {
  try {
    const userId = req.user._id;
    const { themeId } = req.body || {};
    if (!themeId) {
      return res.status(400).json({ success: false, message: 'Theme ID is required' });
    }
    const theme = await ChatTheme.findOne({ _id: themeId, isActive: true }).lean();
    if (!theme) {
      return res.status(404).json({ success: false, message: 'Theme not found' });
    }
    if (theme.isFree) {
      return res.status(400).json({ success: false, message: 'Theme is free; no purchase needed' });
    }
    const price = Number(theme.price);
    if (!price || price <= 0) {
      return res.status(400).json({ success: false, message: 'Theme is not available for purchase' });
    }
    const existing = await UserChatThemePurchase.findOne({ userId, themeId });
    if (existing) {
      return res.status(200).json({ success: true, message: 'Already owned', data: { owned: true } });
    }
    const receipt = `th_${themeId}_${Date.now()}`.substring(0, 40);
    const order = await createRazorpayOrder(price, 'INR', receipt);
    res.status(200).json({
      success: true,
      data: {
        orderId: order.id,
        amount: price,
        currency: 'INR',
        key: process.env.RAZORPAY_KEY_ID,
        themeId: theme._id.toString(),
        themeName: theme.name,
      },
    });
  } catch (error) {
    console.error('Create chat theme order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create order',
      error: error.message,
    });
  }
};

// Verify Razorpay payment and grant chat theme
export const verifyChatThemePayment = async (req, res) => {
  try {
    const userId = req.user._id;
    const { orderId, paymentId, signature, themeId } = req.body || {};
    if (!orderId || !paymentId || !signature || !themeId) {
      return res.status(400).json({ success: false, message: 'Missing orderId, paymentId, signature or themeId' });
    }
    const isValid = verifyPaymentSignature(orderId, paymentId, signature);
    if (!isValid) {
      return res.status(400).json({ success: false, message: 'Invalid payment signature' });
    }
    const theme = await ChatTheme.findOne({ _id: themeId, isActive: true });
    if (!theme) {
      return res.status(404).json({ success: false, message: 'Theme not found' });
    }
    if (theme.isFree) {
      return res.status(400).json({ success: false, message: 'Theme is free' });
    }
    const existingByPayment = await UserChatThemePurchase.findOne({ paymentTransactionId: paymentId });
    if (existingByPayment) {
      return res.status(200).json({ success: true, message: 'Payment already processed', data: { owned: true } });
    }
    const existing = await UserChatThemePurchase.findOne({ userId, themeId });
    if (existing) {
      return res.status(200).json({ success: true, message: 'Already owned', data: { owned: true } });
    }
    await UserChatThemePurchase.create({
      userId,
      themeId,
      paymentTransactionId: paymentId,
    });
    await ChatTheme.updateOne({ _id: themeId }, { $inc: { purchaseCount: 1 } });
    res.status(200).json({ success: true, message: 'Theme purchased', data: { owned: true } });
  } catch (error) {
    console.error('Verify chat theme payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify payment',
      error: error.message,
    });
  }
};

// Legacy: direct grant (e.g. admin or free theme) – prefer createOrder + verify for paid
export const purchaseChatTheme = async (req, res) => {
  try {
    const userId = req.user._id;
    const { themeId } = req.body || {};
    if (!themeId) {
      return res.status(400).json({ success: false, message: 'Theme ID is required' });
    }
    const theme = await ChatTheme.findOne({ _id: themeId, isActive: true });
    if (!theme) {
      return res.status(404).json({ success: false, message: 'Theme not found' });
    }
    if (theme.isFree) {
      return res.status(400).json({ success: false, message: 'Theme is free; no purchase needed' });
    }
    const existing = await UserChatThemePurchase.findOne({ userId, themeId });
    if (existing) {
      return res.status(200).json({ success: true, message: 'Already owned', data: { owned: true } });
    }
    return res.status(400).json({
      success: false,
      message: 'Paid themes require payment. Use create-order and verify-payment.',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to purchase theme',
      error: error.message,
    });
  }
};

// Get chat theme/wallpaper settings (Telegram-style); resolve theme when themeId set
export const getChatSettings = async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user._id;

    const chat = await Chat.findById(chatId).select('participants').lean();
    if (!chat || !chat.participants.some(p => p.toString() === userId.toString())) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to view this chat',
      });
    }

    let settings = await ChatSettings.findOne({ userId, chatId }).populate('themeId').lean();
    if (!settings) {
      settings = await ChatSettings.create({ userId, chatId });
      settings = (await ChatSettings.findOne({ userId, chatId }).populate('themeId').lean()) || settings.toObject();
    }

    // User-side only shows admin theme values; ignore any previously saved custom wallpaper/bubble colors
    const theme = settings.themeId;
    const wallpaper = theme?.wallpaper || null;
    const backgroundColor = theme?.backgroundColor || null;
    const outgoingBubbleColor = theme?.outgoingBubbleColor || null;
    const incomingBubbleColor = theme?.incomingBubbleColor || null;
    const outgoingTextColor = theme?.outgoingBubbleTextColor || null;
    const incomingTextColor = theme?.incomingBubbleTextColor || null;

    res.status(200).json({
      success: true,
      data: {
        themeId: settings.themeId?._id || settings.themeId || null,
        wallpaper,
        backgroundColor,
        theme: settings.theme || 'default',
        outgoingBubbleColor,
        incomingBubbleColor,
        outgoingTextColor,
        incomingTextColor,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get chat settings',
      error: error.message,
    });
  }
};

// Update chat theme/wallpaper (Telegram-style); themeId must be owned or free
export const updateChatSettings = async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user._id;
    const { themeId, wallpaper, backgroundColor, theme, outgoingBubbleColor, incomingBubbleColor, outgoingTextColor, incomingTextColor } = req.body || {};

    const chat = await Chat.findById(chatId).select('participants').lean();
    if (!chat || !chat.participants.some(p => p.toString() === userId.toString())) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to update this chat',
      });
    }

    if (themeId !== undefined && themeId !== null && themeId !== '') {
      const themeDoc = await ChatTheme.findOne({ _id: themeId, isActive: true });
      if (!themeDoc) {
        return res.status(400).json({ success: false, message: 'Theme not found or inactive' });
      }
      if (!themeDoc.isFree) {
        const owned = await UserChatThemePurchase.findOne({ userId, themeId });
        if (!owned) {
          return res.status(403).json({ success: false, message: 'Purchase this theme first to use it' });
        }
      }
    }

    const update = {};
    if (themeId !== undefined) update.themeId = themeId || null;
    // When user picks a theme, clear any custom wallpaper/colors so only admin theme values are shown
    if (themeId !== undefined && themeId !== null && themeId !== '') {
      update.wallpaper = null;
      update.backgroundColor = null;
      update.outgoingBubbleColor = null;
      update.incomingBubbleColor = null;
      update.outgoingTextColor = null;
      update.incomingTextColor = null;
    } else {
      if (wallpaper !== undefined) update.wallpaper = wallpaper || null;
      if (backgroundColor !== undefined) update.backgroundColor = backgroundColor || null;
      if (outgoingBubbleColor !== undefined) update.outgoingBubbleColor = outgoingBubbleColor || null;
      if (incomingBubbleColor !== undefined) update.incomingBubbleColor = incomingBubbleColor || null;
      if (outgoingTextColor !== undefined) update.outgoingTextColor = outgoingTextColor || null;
      if (incomingTextColor !== undefined) update.incomingTextColor = incomingTextColor || null;
    }
    if (theme !== undefined) update.theme = theme || 'default';

    let settings = await ChatSettings.findOneAndUpdate(
      { userId, chatId },
      { $set: update },
      { new: true, upsert: true }
    ).populate('themeId').lean();

    const th = settings.themeId;
    res.status(200).json({
      success: true,
      message: 'Chat settings updated',
      data: {
        themeId: th?._id || settings.themeId || null,
        wallpaper: settings.wallpaper != null ? settings.wallpaper : (th?.wallpaper || null),
        backgroundColor: settings.backgroundColor != null ? settings.backgroundColor : (th?.backgroundColor || null),
        theme: settings.theme || 'default',
        outgoingBubbleColor: settings.outgoingBubbleColor != null ? settings.outgoingBubbleColor : (th?.outgoingBubbleColor || null),
        incomingBubbleColor: settings.incomingBubbleColor != null ? settings.incomingBubbleColor : (th?.incomingBubbleColor || null),
        outgoingTextColor: settings.outgoingTextColor != null ? settings.outgoingTextColor : (th?.outgoingBubbleTextColor || null),
        incomingTextColor: settings.incomingTextColor != null ? settings.incomingTextColor : (th?.incomingBubbleTextColor || null),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update chat settings',
      error: error.message,
    });
  }
};

// ─── Chat prefs (archive, cleared, block, pin, mute, close friends, groups) ───
async function getOrCreatePrefs(userId) {
  let prefs = await UserChatPrefs.findOne({ userId }).lean();
  if (!prefs) {
    prefs = await UserChatPrefs.create({
      userId,
      archivedUserIds: [],
      clearedUserIds: [],
      blockedUserIds: [],
      pinnedUserIds: [],
      mutedUserIds: [],
      closeFriendsUserIds: [],
      groups: [],
    });
    prefs = prefs.toObject();
  }
  return prefs;
}

function toIds(arr) {
  return (arr || []).map((id) => (id && id.toString ? id.toString() : id));
}

export const getChatPrefs = async (req, res) => {
  try {
    const userId = req.user._id;
    const prefs = await getOrCreatePrefs(userId);
    res.status(200).json({
      success: true,
      data: {
        archivedUserIds: toIds(prefs.archivedUserIds),
        clearedUserIds: toIds(prefs.clearedUserIds),
        blockedUserIds: toIds(prefs.blockedUserIds),
        pinnedUserIds: toIds(prefs.pinnedUserIds),
        mutedUserIds: toIds(prefs.mutedUserIds),
        closeFriendsUserIds: toIds(prefs.closeFriendsUserIds),
        groups: (prefs.groups || []).map((g) => ({
          id: g._id?.toString() || null,
          name: g.name,
          memberIds: toIds(g.memberIds),
        })),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch chat prefs',
      error: error.message,
    });
  }
};

export const updateArchive = async (req, res) => {
  try {
    const userId = req.user._id;
    const { userIds } = req.body || {};
    const ids = Array.isArray(userIds) ? userIds.map(String) : [];
    const prefs = await getOrCreatePrefs(userId);
    const current = new Set(toIds(prefs.archivedUserIds));
    ids.forEach((id) => current.add(id));
    await UserChatPrefs.updateOne(
      { userId },
      { $set: { archivedUserIds: [...current] } },
      { upsert: true }
    );
    res.status(200).json({
      success: true,
      data: { archivedUserIds: [...current] },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to archive chats',
      error: error.message,
    });
  }
};

export const unarchiveChat = async (req, res) => {
  try {
    const userId = req.user._id;
    const { userId: targetUserId } = req.params;
    if (!targetUserId) {
      return res.status(400).json({ success: false, message: 'User ID required' });
    }
    await UserChatPrefs.updateOne(
      { userId },
      { $pull: { archivedUserIds: targetUserId } },
      { upsert: true }
    );
    const prefs = await getOrCreatePrefs(userId);
    res.status(200).json({
      success: true,
      data: { archivedUserIds: toIds(prefs.archivedUserIds) },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to unarchive chat',
      error: error.message,
    });
  }
};

export const setChatCleared = async (req, res) => {
  try {
    const userId = req.user._id;
    const { userId: targetUserId } = req.params;
    if (!targetUserId) {
      return res.status(400).json({ success: false, message: 'User ID required' });
    }
    await UserChatPrefs.updateOne(
      { userId },
      { $addToSet: { clearedUserIds: targetUserId } },
      { upsert: true }
    );
    res.status(200).json({
      success: true,
      message: 'Chat cleared',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to clear chat',
      error: error.message,
    });
  }
};

export const unclearChat = async (req, res) => {
  try {
    const userId = req.user._id;
    const { userId: targetUserId } = req.params;
    if (!targetUserId) {
      return res.status(400).json({ success: false, message: 'User ID required' });
    }
    await UserChatPrefs.updateOne(
      { userId },
      { $pull: { clearedUserIds: targetUserId } },
      { upsert: true }
    );
    res.status(200).json({
      success: true,
      message: 'Messages restored',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to restore chat',
      error: error.message,
    });
  }
};

export const toggleBlockUser = async (req, res) => {
  try {
    const userId = req.user._id;
    const { userId: targetUserId } = req.params;
    if (!targetUserId) {
      return res.status(400).json({ success: false, message: 'User ID required' });
    }
    const prefs = await getOrCreatePrefs(userId);
    const blocked = (prefs.blockedUserIds || []).map((id) => id.toString());
    const set = new Set(blocked);
    if (set.has(targetUserId)) set.delete(targetUserId);
    else set.add(targetUserId);
    await UserChatPrefs.updateOne(
      { userId },
      { $set: { blockedUserIds: [...set] } },
      { upsert: true }
    );
    res.status(200).json({
      success: true,
      data: { blocked: set.has(targetUserId), blockedUserIds: [...set] },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to toggle block',
      error: error.message,
    });
  }
};

export const togglePinChat = async (req, res) => {
  try {
    const userId = req.user._id;
    const { userId: targetUserId } = req.params;
    if (!targetUserId) {
      return res.status(400).json({ success: false, message: 'User ID required' });
    }
    const prefs = await getOrCreatePrefs(userId);
    const pinned = (prefs.pinnedUserIds || []).map((id) => id.toString());
    const set = new Set(pinned);
    if (set.has(targetUserId)) set.delete(targetUserId);
    else set.add(targetUserId);
    await UserChatPrefs.updateOne(
      { userId },
      { $set: { pinnedUserIds: [...set] } },
      { upsert: true }
    );
    res.status(200).json({
      success: true,
      data: { pinned: set.has(targetUserId), pinnedUserIds: [...set] },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to toggle pin',
      error: error.message,
    });
  }
};

export const toggleMuteChat = async (req, res) => {
  try {
    const userId = req.user._id;
    const { userId: targetUserId } = req.params;
    if (!targetUserId) {
      return res.status(400).json({ success: false, message: 'User ID required' });
    }
    const prefs = await getOrCreatePrefs(userId);
    const muted = (prefs.mutedUserIds || []).map((id) => id.toString());
    const set = new Set(muted);
    if (set.has(targetUserId)) set.delete(targetUserId);
    else set.add(targetUserId);
    await UserChatPrefs.updateOne(
      { userId },
      { $set: { mutedUserIds: [...set] } },
      { upsert: true }
    );
    res.status(200).json({
      success: true,
      data: { muted: set.has(targetUserId), mutedUserIds: [...set] },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to toggle mute',
      error: error.message,
    });
  }
};

export const toggleCloseFriend = async (req, res) => {
  try {
    const userId = req.user._id;
    const { userId: targetUserId } = req.params;
    if (!targetUserId) {
      return res.status(400).json({ success: false, message: 'User ID required' });
    }
    const prefs = await getOrCreatePrefs(userId);
    const closeFriends = (prefs.closeFriendsUserIds || []).map((id) => id.toString());
    const set = new Set(closeFriends);
    if (set.has(targetUserId)) set.delete(targetUserId);
    else set.add(targetUserId);
    await UserChatPrefs.updateOne(
      { userId },
      { $set: { closeFriendsUserIds: [...set] } },
      { upsert: true }
    );
    res.status(200).json({
      success: true,
      data: { closeFriend: set.has(targetUserId), closeFriendsUserIds: [...set] },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to toggle close friend',
      error: error.message,
    });
  }
};

export const createChatGroup = async (req, res) => {
  try {
    const userId = req.user._id;
    const { name, memberIds } = req.body || {};
    const nameStr = typeof name === 'string' ? name.trim() : '';
    const ids = Array.isArray(memberIds) ? memberIds.map(String).filter(Boolean) : [];
    if (!nameStr) {
      return res.status(400).json({ success: false, message: 'Group name is required' });
    }
    const prefs = await getOrCreatePrefs(userId);
    const groups = Array.isArray(prefs.groups) ? [...prefs.groups] : [];
    const newGroup = {
      _id: new mongoose.Types.ObjectId(),
      name: nameStr,
      memberIds: ids,
    };
    groups.push(newGroup);
    await UserChatPrefs.updateOne(
      { userId },
      { $set: { groups } },
      { upsert: true }
    );
    res.status(201).json({
      success: true,
      data: {
        id: newGroup._id.toString(),
        name: newGroup.name,
        memberIds: newGroup.memberIds || [],
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create group',
      error: error.message,
    });
  }
};
