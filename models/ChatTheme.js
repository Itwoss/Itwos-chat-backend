import mongoose from 'mongoose';

const chatThemeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Theme name is required'],
    trim: true,
    maxlength: [80, 'Name cannot exceed 80 characters'],
  },
  description: {
    type: String,
    trim: true,
    maxlength: [300, 'Description cannot exceed 300 characters'],
    default: '',
  },
  wallpaper: {
    type: String,
    trim: true,
    default: null,
  },
  backgroundColor: {
    type: String,
    trim: true,
    default: null,
  },
  thumbnail: {
    type: String,
    trim: true,
    default: null,
  },
  isFree: {
    type: Boolean,
    default: true,
  },
  price: {
    type: Number,
    min: [0, 'Price cannot be negative'],
    default: 0,
  },
  outgoingBubbleColor: {
    type: String,
    trim: true,
    default: null,
  },
  incomingBubbleColor: {
    type: String,
    trim: true,
    default: null,
  },
  outgoingBubbleTextColor: {
    type: String,
    trim: true,
    default: null,
  },
  incomingBubbleTextColor: {
    type: String,
    trim: true,
    default: null,
  },
  sortOrder: {
    type: Number,
    default: 0,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  purchaseCount: {
    type: Number,
    default: 0,
    min: 0,
  },
}, { timestamps: true });

chatThemeSchema.index({ isActive: 1, sortOrder: 1 });
chatThemeSchema.index({ isFree: 1 });

const ChatTheme = mongoose.model('ChatTheme', chatThemeSchema);
export default ChatTheme;
