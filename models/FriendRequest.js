import mongoose from 'mongoose';

const friendRequestSchema = new mongoose.Schema({
  fromUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'From user is required']
  },
  toUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'To user is required']
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected', 'cancelled', 'following'],
    default: 'pending'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  respondedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Index for faster queries
friendRequestSchema.index({ toUser: 1, status: 1 });
friendRequestSchema.index({ fromUser: 1, status: 1 });
friendRequestSchema.index({ status: 1 });
friendRequestSchema.index({ fromUser: 1, toUser: 1, status: 1 });
// Additional indexes for scalability
friendRequestSchema.index({ fromUser: 1, status: 1, createdAt: -1 });
friendRequestSchema.index({ toUser: 1, status: 1, createdAt: -1 });
friendRequestSchema.index({ createdAt: -1 });

// Prevent duplicate requests (this also creates fromUser+toUser index)
friendRequestSchema.index({ fromUser: 1, toUser: 1 }, { unique: true });

const FriendRequest = mongoose.model('FriendRequest', friendRequestSchema);

export default FriendRequest;

