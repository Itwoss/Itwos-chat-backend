import mongoose from 'mongoose';

const chatSchema = new mongoose.Schema({
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  lastMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  lastMessageAt: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for faster queries
chatSchema.index({ lastMessageAt: -1 });
chatSchema.index({ isActive: 1, lastMessageAt: -1 });
chatSchema.index({ participants: 1, isActive: 1 });

// Ensure unique chat between two users (this also creates participants index)
chatSchema.index({ participants: 1 }, { unique: true });

const Chat = mongoose.model('Chat', chatSchema);

export default Chat;

