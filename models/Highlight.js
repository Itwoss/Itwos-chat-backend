import mongoose from 'mongoose';

const highlightSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  title: {
    type: String,
    required: [true, 'Highlight title is required'],
    trim: true,
    maxlength: [50, 'Title cannot exceed 50 characters'],
  },
  coverImage: {
    type: String,
    trim: true,
    default: null,
  },
  stories: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Story',
  }],
  isActive: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});

// Indexes
highlightSchema.index({ user: 1, createdAt: -1 });
highlightSchema.index({ isActive: 1 });

const Highlight = mongoose.model('Highlight', highlightSchema);

export default Highlight;



