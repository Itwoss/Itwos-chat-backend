import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  chatId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chat',
    required: [true, 'Chat ID is required']
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Sender is required']
  },
  receiver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Receiver is required']
  },
  content: {
    type: String,
    required: [true, 'Message content is required'],
    trim: true
  },
  messageType: {
    type: String,
    enum: ['text', 'image', 'file', 'audio'],
    default: 'text'
  },
  attachments: [{
    url: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: ['image', 'file', 'audio']
    },
    name: {
      type: String
    }
  }],
  status: {
    type: String,
    enum: ['sent', 'delivered', 'read'],
    default: 'sent'
  },
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: {
    type: Date
  },
  deliveredAt: {
    type: Date
  },
  isEncrypted: {
    type: Boolean,
    default: true
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date
  },
  deletedForEveryone: {
    type: Boolean,
    default: false
  },
  // Users who hid this message (delete for me)
  hiddenFor: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  }
}, {
  timestamps: true
});

// Index for faster queries - optimized for user-based queries
messageSchema.index({ chatId: 1, createdAt: -1 });
messageSchema.index({ sender: 1, receiver: 1 });
messageSchema.index({ receiver: 1, isRead: 1, isDeleted: 1 });
messageSchema.index({ chatId: 1, receiver: 1, isRead: 1, isDeleted: 1 });
messageSchema.index({ chatId: 1, sender: 1, isDeleted: 1 });
messageSchema.index({ chatId: 1, receiver: 1, status: 1, isDeleted: 1 });
messageSchema.index({ createdAt: -1 });
// Compound index for user-specific message queries (optimized for userId-based sharding)
messageSchema.index({ chatId: 1, sender: 1, receiver: 1, isDeleted: 1, createdAt: -1 });
messageSchema.index({ chatId: 1, hiddenFor: 1 });

const Message = mongoose.model('Message', messageSchema);

export default Message;

