import express from 'express';
import {
  getOrCreateChat,
  getUserChats,
  getChatMessages,
  sendMessage,
  deleteMessage,
  markMessagesAsRead,
  getUnreadCount,
  getChatSettings,
  updateChatSettings,
  getChatThemes,
  purchaseChatTheme,
  createChatThemeOrder,
  verifyChatThemePayment,
  getChatPrefs,
  updateArchive,
  unarchiveChat as unarchiveChatPrefs,
  setChatCleared,
  unclearChat,
  toggleBlockUser,
  togglePinChat,
  toggleMuteChat,
  toggleCloseFriend,
  createChatGroup,
} from '../controllers/chatController.js';
import { createLiveKitCallToken } from '../controllers/chatCallController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { uploadSingleMaybe } from '../middleware/upload.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);
router.use(authorize('user'));

// Routes
router.get('/chats', getUserChats);
router.get('/chat/:userId', getOrCreateChat);
router.get('/chat/:chatId/messages', getChatMessages);
router.post('/message', uploadSingleMaybe, sendMessage);
router.delete('/message/:messageId', deleteMessage);
router.get('/chat-themes', getChatThemes);
router.post('/chat-themes/create-order', createChatThemeOrder);
router.post('/chat-themes/verify-payment', verifyChatThemePayment);
router.post('/chat-themes/purchase', purchaseChatTheme);
router.get('/chat/:chatId/settings', getChatSettings);
router.put('/chat/:chatId/settings', updateChatSettings);
router.put('/chat/:chatId/read', markMessagesAsRead);
router.get('/unread-count', getUnreadCount);

// Chat prefs (archive, cleared, block, pin, mute, close friends, groups)
router.get('/prefs', getChatPrefs);
router.put('/prefs/archive', updateArchive);
router.delete('/prefs/archive/:userId', unarchiveChatPrefs);
router.put('/prefs/cleared/:userId', setChatCleared);
router.delete('/prefs/cleared/:userId', unclearChat);
router.put('/prefs/block/:userId', toggleBlockUser);
router.put('/prefs/pin/:userId', togglePinChat);
router.put('/prefs/mute/:userId', toggleMuteChat);
router.put('/prefs/close-friend/:userId', toggleCloseFriend);
router.post('/prefs/groups', createChatGroup);

/** LiveKit JWT for 1:1 voice/video (body: { peerUserId, callType?: 'audio'|'video' }) */
router.post('/call/token', createLiveKitCallToken);

export default router;

