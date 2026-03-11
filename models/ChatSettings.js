import mongoose from 'mongoose';

const chatSettingsSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  chatId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chat',
    required: true,
  },
  themeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChatTheme',
    default: null,
  },
  wallpaper: {
    type: String,
    default: null,
  },
  backgroundColor: {
    type: String,
    default: null,
  },
  theme: {
    type: String,
    enum: ['default', 'dark', 'light', 'blue', 'green', 'purple', 'custom'],
    default: 'default',
  },
  outgoingBubbleColor: {
    type: String,
    default: null,
  },
  incomingBubbleColor: {
    type: String,
    default: null,
  },
  outgoingTextColor: {
    type: String,
    default: null,
  },
  incomingTextColor: {
    type: String,
    default: null,
  },
}, { timestamps: true });

chatSettingsSchema.index({ userId: 1, chatId: 1 }, { unique: true });

const ChatSettings = mongoose.model('ChatSettings', chatSettingsSchema);
export default ChatSettings;
