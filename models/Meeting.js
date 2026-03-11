import mongoose from 'mongoose';

const meetingSchema = new mongoose.Schema({
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ClientProject',
    required: [true, 'Project ID is required']
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required']
  },
  requestedBy: {
    type: String,
    enum: ['client', 'admin'],
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'scheduled', 'completed', 'cancelled'],
    default: 'pending'
  },
  requestedDate: {
    type: Date,
    required: true
  },
  scheduledDate: {
    type: Date
  },
  scheduledTime: {
    type: String,
    trim: true
  },
  meetingLink: {
    type: String,
    trim: true
  },
  meetingPlatform: {
    type: String,
    enum: ['google-meet', 'zoom', 'teams', 'other'],
    default: 'google-meet'
  },
  agenda: {
    type: String,
    trim: true
  },
  notes: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Index for faster queries
meetingSchema.index({ projectId: 1 });
meetingSchema.index({ userId: 1 });
meetingSchema.index({ status: 1 });

const Meeting = mongoose.model('Meeting', meetingSchema);

export default Meeting;

