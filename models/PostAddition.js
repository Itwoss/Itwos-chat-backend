import mongoose from 'mongoose';

const postAdditionSchema = new mongoose.Schema({
  adder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  post: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post',
    required: true,
    index: true,
  },
  visibility: {
    type: String,
    enum: ['friends', 'public'],
    required: true,
  },
  addedAt: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

postAdditionSchema.index({ adder: 1, post: 1 }, { unique: true });
postAdditionSchema.index({ visibility: 1, addedAt: -1 });
postAdditionSchema.index({ adder: 1, addedAt: -1 });

export default mongoose.model('PostAddition', postAdditionSchema);
