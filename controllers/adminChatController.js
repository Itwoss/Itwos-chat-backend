import User from '../models/User.js';
import FriendRequest from '../models/FriendRequest.js';
import Chat from '../models/Chat.js';
import Message from '../models/Message.js';

// Get user's friends list (Admin view)
export const getUserFriendsAdmin = async (req, res) => {
  try {
    const { userId } = req.params;

    const friendships = await FriendRequest.find({
      $or: [
        { fromUser: userId, status: 'accepted' },
        { toUser: userId, status: 'accepted' }
      ]
    })
      .populate('fromUser', 'name email profileImage accountType onlineStatus lastSeen')
      .populate('toUser', 'name email profileImage accountType onlineStatus lastSeen')
      .sort({ updatedAt: -1 })
      .lean();

    // Deduplicate friends (mutual follows create two records)
    const friendsMap = new Map();
    friendships.forEach(fr => {
      // Get the friend (the other user)
      const friend = fr.fromUser._id.toString() === userId ? fr.toUser : fr.fromUser;
      
      // Handle case where friend might be an ObjectId (if populate failed)
      if (!friend || !friend._id) {
        return; // Skip if friend data is missing
      }
      
      const friendId = friend._id.toString();
      
      // Only add if not already in map (avoid duplicates from mutual follow records)
      if (!friendsMap.has(friendId)) {
        friendsMap.set(friendId, {
          _id: friend._id,
          name: friend.name,
          email: friend.email,
          profileImage: friend.profileImage,
          accountType: friend.accountType,
          onlineStatus: friend.onlineStatus,
          lastSeen: friend.lastSeen,
          friendshipId: fr._id,
          createdAt: fr.createdAt
        });
      }
    });

    const friends = Array.from(friendsMap.values());

    res.status(200).json({
      success: true,
      data: friends,
      count: friends.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user friends',
      error: error.message
    });
  }
};

// Get user's chats (Admin view)
export const getUserChatsAdmin = async (req, res) => {
  try {
    const { userId } = req.params;

    const chats = await Chat.find({
      participants: userId,
      isActive: true
    })
      .populate('participants', 'name email profileImage accountType onlineStatus lastSeen')
      .populate('lastMessage')
      .sort({ lastMessageAt: -1 });

    const chatsWithOtherUser = chats.map(chat => {
      const otherUser = chat.participants.find(p => p._id.toString() !== userId);
      return {
        _id: chat._id,
        otherUser,
        lastMessage: chat.lastMessage,
        lastMessageAt: chat.lastMessageAt,
        createdAt: chat.createdAt
      };
    });

    res.status(200).json({
      success: true,
      data: chatsWithOtherUser
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user chats',
      error: error.message
    });
  }
};

// Get messages for a chat (Admin view - encrypted, cannot decrypt)
export const getChatMessagesAdmin = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }

    const messages = await Message.find({
      chatId,
      isDeleted: false
    })
      .select('sender receiver messageType attachments status isRead readAt deliveredAt createdAt')
      .populate('sender', 'name email profileImage')
      .populate('receiver', 'name email profileImage')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Admin cannot see message content - show encrypted indicator
    const adminViewMessages = messages.map(msg => ({
      ...msg,
      content: msg.isEncrypted ? '[Encrypted Message - Content Protected]' : '[Message Content Hidden]',
      isEncrypted: true // Always show as encrypted to admin
    }));

    const total = await Message.countDocuments({ chatId, isDeleted: false });

    res.status(200).json({
      success: true,
      data: adminViewMessages.reverse(),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      },
      note: 'Message content is encrypted and cannot be viewed by administrators for privacy protection.'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch messages',
      error: error.message
    });
  }
};

