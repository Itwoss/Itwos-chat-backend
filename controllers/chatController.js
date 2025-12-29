import Chat from '../models/Chat.js';
import Message from '../models/Message.js';
import FriendRequest from '../models/FriendRequest.js';
import User from '../models/User.js';
import { validationResult } from 'express-validator';
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
        return res.status(403).json({
          success: false,
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
        if (chat.lastMessage.isEncrypted && chat.lastMessage.content) {
          try {
            decryptedContent = decryptMessage(chat.lastMessage.content);
          } catch (error) {
            console.error('Error decrypting last message:', error);
            decryptedContent = '[Encrypted Message]';
          }
        } else {
          decryptedContent = chat.lastMessage.content;
        }
        
        // Handle message type display
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

    // Optimized query with lean() and select only needed fields
    // Use userId-based query optimization for faster loading
    const messages = await Message.find({
      chatId,
      isDeleted: false,
      $or: [
        { sender: userId },
        { receiver: userId }
      ]
    })
      .select('sender receiver content messageType attachments status isRead readAt deliveredAt isEncrypted createdAt')
      .populate('sender', 'name email profileImage')
      .populate('receiver', 'name email profileImage')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Decrypt messages for the user
    const decryptedMessages = messages.map(msg => {
      if (msg.isEncrypted && msg.content) {
        try {
          msg.content = decryptMessage(msg.content);
        } catch (error) {
          console.error('Decryption error for message:', msg._id);
        }
      }
      return msg;
    });

    const total = await Message.countDocuments({ 
      chatId, 
      isDeleted: false,
      $or: [
        { sender: userId },
        { receiver: userId }
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

// Send message
export const sendMessage = async (req, res) => {
  try {
    const senderId = req.user._id;
    let { chatId, content = '', messageType = 'text' } = req.body;
    
    // Validate chatId
    if (!chatId || typeof chatId !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Chat ID is required and must be a valid string'
      });
    }
    
    // Handle FormData (file upload)
    let attachments = [];
    if (req.file) {
      const fs = await import('fs');
      const cloudinary = (await import('../utils/cloudinary.js')).default;
      
      try {
        // Upload file to Cloudinary
        const result = await cloudinary.uploader.upload(req.file.path, {
          folder: 'chat-app/messages',
          resource_type: 'auto',
        });
        
        // Determine message type based on file
        if (req.file.mimetype.startsWith('image/')) {
          messageType = 'image';
        } else if (req.file.mimetype.startsWith('audio/')) {
          messageType = 'audio';
        } else {
          messageType = 'file';
        }
        
        attachments = [{
          url: result.secure_url,
          type: messageType, // 'image', 'audio', or 'file'
          name: req.file.originalname,
        }];
        
        // Delete temporary file
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        
        // Set default content if not provided
        if (!content || content.trim() === '') {
          content = messageType === 'image' ? 'Image' : req.file.originalname;
        }
      } catch (uploadError) {
        console.error('Error uploading file:', uploadError);
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

    // Get receiver
    const receiverId = chat.participants.find(p => p.toString() !== senderId.toString());

    // Encrypt message content (only if it's not a default placeholder)
    const encryptedContent = content && content !== 'Image' && !attachments.some(a => a.name === content)
      ? encryptMessage(content)
      : content;

    // Create message with encrypted content
    const message = await Message.create({
      chatId,
      sender: senderId,
      receiver: receiverId,
      content: encryptedContent,
      messageType,
      attachments,
      status: 'sent',
      isEncrypted: encryptedContent !== content
    });

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

    // Decrypt content for response (sender can see their own message)
    if (populatedMessage.isEncrypted && populatedMessage.content) {
      populatedMessage.content = decryptMessage(populatedMessage.content);
    }

    // Emit message via Socket.IO to receiver
    // Note: Socket.IO will handle this via the send-message event from frontend
    // The message is already created and stored, frontend will emit the socket event

    // Create notification for receiver
    await createNotification(
      receiverId,
      'message',
      'New Message',
      `${req.user.name} sent you a message`,
      null,
      null,
      `/user/chat/${senderId}`
    );

    // Add count for valid chat message (only text messages, not duplicates)
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

// Delete message
export const deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user._id;

    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    if (message.sender.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own messages'
      });
    }

    message.isDeleted = true;
    message.deletedAt = new Date();
    await message.save();

    res.status(200).json({
      success: true,
      message: 'Message deleted successfully'
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
      isDeleted: false
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

