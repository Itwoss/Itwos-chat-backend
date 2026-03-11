import mongoose from 'mongoose';

const demoBookingSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required']
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: [true, 'Project ID is required']
  },
  requirements: {
    type: String,
    required: [true, 'Requirements are required'],
    trim: true
  },
  preferredDate: {
    type: Date
  },
  preferredTime: {
    type: String,
    trim: true
  },
  projectType: {
    type: String,
    required: [true, 'Project type is required'],
    trim: true
  },
  budget: {
    type: String,
    required: [true, 'Budget is required'],
    trim: true
  },
  deadline: {
    type: Date,
    required: [true, 'Deadline is required']
  },
  contactPhone: {
    type: String,
    trim: true
  },
  contactEmail: {
    type: String,
    trim: true,
    lowercase: true
  },
  additionalContactInfo: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'cancelled', 'completed'],
    default: 'pending'
  },
  adminNotes: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Index for faster queries
demoBookingSchema.index({ userId: 1 });
demoBookingSchema.index({ projectId: 1 });
demoBookingSchema.index({ status: 1 });

const DemoBooking = mongoose.model('DemoBooking', demoBookingSchema);

export default DemoBooking;

