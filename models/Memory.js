import mongoose from 'mongoose';

const memorySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  images: [{
    type: String, // Cloudinary URLs
  }],
  caption: {
    type: String,
    trim: true,
    default: '',
  },
  // Date/year when the memory is from (e.g. old photo from 2010, or "this day" in 2020)
  memoryDate: {
    type: Date,
    required: true,
    index: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

memorySchema.index({ user: 1, memoryDate: -1 });
memorySchema.index({ user: 1, createdAt: -1 });

const Memory = mongoose.model('Memory', memorySchema);

export default Memory;
