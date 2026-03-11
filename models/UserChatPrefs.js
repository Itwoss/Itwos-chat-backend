import mongoose from 'mongoose';

const userChatPrefsSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },
  archivedUserIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  clearedUserIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  blockedUserIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  pinnedUserIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  mutedUserIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  closeFriendsUserIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  groups: [{
    name: { type: String, required: true, trim: true },
    memberIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  }],
}, {
  timestamps: true,
});

// userId already indexed via unique: true
const UserChatPrefs = mongoose.model('UserChatPrefs', userChatPrefsSchema);
export default UserChatPrefs;
