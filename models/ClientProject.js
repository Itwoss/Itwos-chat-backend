import mongoose from 'mongoose';

const clientProjectSchema = new mongoose.Schema({
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DemoBooking',
    required: [true, 'Booking ID is required'],
    unique: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required']
  },
  projectTitle: {
    type: String,
    required: [true, 'Project title is required'],
    trim: true
  },
  description: {
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
    trim: true
  },
  deadline: {
    type: Date,
    required: [true, 'Deadline is required']
  },
  status: {
    type: String,
    enum: ['planning', 'in-progress', 'review', 'testing', 'completed', 'on-hold', 'cancelled'],
    default: 'planning'
  },
  progress: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  requirements: {
    type: String,
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
  milestones: [{
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    dueDate: {
      type: Date
    },
    status: {
      type: String,
      enum: ['pending', 'in-progress', 'completed'],
      default: 'pending'
    },
    completedDate: {
      type: Date
    }
  }],
  files: [{
    url: {
      type: String,
      required: true
    },
    name: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: ['image', 'document', 'other']
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  adminNotes: {
    type: String,
    trim: true
  },
  clientNotes: [{
    note: {
      type: String,
      required: true,
      trim: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  activityTimeline: [{
    type: {
      type: String,
      enum: ['status_change', 'progress_update', 'note_added', 'milestone_updated', 'meeting_scheduled', 'file_uploaded'],
      required: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    performedBy: {
      type: String,
      enum: ['admin', 'client'],
      required: true
    },
    oldValue: {
      type: String
    },
    newValue: {
      type: String
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  startDate: {
    type: Date
  },
  completedDate: {
    type: Date
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for faster queries
clientProjectSchema.index({ userId: 1 });
clientProjectSchema.index({ bookingId: 1 });
clientProjectSchema.index({ status: 1 });
clientProjectSchema.index({ isActive: 1 });

const ClientProject = mongoose.model('ClientProject', clientProjectSchema);

export default ClientProject;

