import mongoose from 'mongoose';

const projectSchema = new mongoose.Schema({
  websiteTitle: {
    type: String,
    required: [true, 'Website title is required'],
    trim: true
  },
  link: {
    type: String,
    required: [true, 'Link is required'],
    trim: true
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true
  },
  techStack: [{
    type: String,
    trim: true
  }],
  teamMembers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Team'
  }],
  images: [{
    type: String, // Cloudinary URLs
    trim: true
  }],
  files: [{
    type: String, // Cloudinary URLs
    trim: true
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  status: {
    type: String,
    enum: ['planning', 'in-progress', 'completed', 'on-hold', 'cancelled'],
    default: 'planning'
  },
  startDate: {
    type: Date
  },
  endDate: {
    type: Date
  }
}, {
  timestamps: true
});

// Index for faster queries
projectSchema.index({ isActive: 1 });
projectSchema.index({ websiteTitle: 1 });

const Project = mongoose.model('Project', projectSchema);

export default Project;

