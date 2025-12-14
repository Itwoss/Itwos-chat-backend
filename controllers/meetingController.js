import Meeting from '../models/Meeting.js';
import ClientProject from '../models/ClientProject.js';
import { validationResult } from 'express-validator';
import { createNotification } from './notificationController.js';

// Request meeting (User)
export const requestMeeting = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { projectId, requestedDate, agenda } = req.body;
    const userId = req.user._id;

    // Check if project exists and belongs to user
    const project = await ClientProject.findById(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    if (project.userId.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to request a meeting for this project'
      });
    }

    // Check if there's already a pending meeting
    const existingMeeting = await Meeting.findOne({
      projectId,
      status: 'pending'
    });

    if (existingMeeting) {
      return res.status(400).json({
        success: false,
        message: 'You already have a pending meeting request for this project'
      });
    }

    const meeting = await Meeting.create({
      projectId,
      userId,
      requestedBy: 'client',
      requestedDate: new Date(requestedDate),
      agenda: agenda || null,
      status: 'pending'
    });

    // Create notification for all admins
    await createAdminNotification(
      'meeting_request',
      'New Meeting Request',
      `Client has requested a meeting for project: ${project.projectTitle}`,
      projectId,
      meeting._id,
      `/admin/client-projects/${projectId}`
    );

    // Add to activity timeline
    project.activityTimeline.push({
      type: 'meeting_scheduled',
      title: 'Meeting Requested',
      description: `Client requested a meeting on ${new Date(requestedDate).toLocaleDateString()}`,
      performedBy: 'client',
      createdAt: new Date()
    });
    await project.save();

    res.status(201).json({
      success: true,
      message: 'Meeting request submitted successfully',
      data: meeting
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to request meeting',
      error: error.message
    });
  }
};

// Get meetings for a project
export const getProjectMeetings = async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user._id;
    const role = req.user.role;

    // Check if project exists
    const project = await ClientProject.findById(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    // Check permissions
    if (role !== 'admin' && project.userId.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view meetings for this project'
      });
    }

    const meetings = await Meeting.find({ projectId })
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: meetings
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch meetings',
      error: error.message
    });
  }
};

// Schedule meeting (Admin)
export const scheduleMeeting = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const { scheduledDate, scheduledTime, meetingLink, meetingPlatform, notes } = req.body;

    const meeting = await Meeting.findById(id);
    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }

    if (meeting.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Meeting is not pending'
      });
    }

    meeting.status = 'scheduled';
    meeting.scheduledDate = new Date(scheduledDate);
    meeting.scheduledTime = scheduledTime || null;
    meeting.meetingLink = meetingLink || null;
    meeting.meetingPlatform = meetingPlatform || 'google-meet';
    meeting.notes = notes || null;

    await meeting.save();

    // Get project
    const project = await ClientProject.findById(meeting.projectId);

    // Create notification for client
    await createNotification(
      meeting.userId,
      'meeting_scheduled',
      'Meeting Scheduled',
      `Your meeting for project "${project.projectTitle}" has been scheduled`,
      meeting.projectId,
      meeting._id,
      `/user/client-projects/${meeting.projectId}`
    );

    // Add to activity timeline
    project.activityTimeline.push({
      type: 'meeting_scheduled',
      title: 'Meeting Scheduled',
      description: `Meeting scheduled for ${new Date(scheduledDate).toLocaleDateString()} at ${scheduledTime || 'TBD'}. ${meetingLink ? `Link: ${meetingLink}` : ''}`,
      performedBy: 'admin',
      createdAt: new Date()
    });
    await project.save();

    res.status(200).json({
      success: true,
      message: 'Meeting scheduled successfully',
      data: meeting
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to schedule meeting',
      error: error.message
    });
  }
};

// Get all meetings (Admin)
export const getAllMeetings = async (req, res) => {
  try {
    const { page = 1, limit = 10, status = '', search = '' } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = {};
    if (status) {
      query.status = status;
    }

    // Search by user name/email or project title
    if (search) {
      const User = (await import('../models/User.js')).default;
      const ClientProject = (await import('../models/ClientProject.js')).default;
      
      const users = await User.find({
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ]
      }).select('_id').lean();

      const projects = await ClientProject.find({
        projectTitle: { $regex: search, $options: 'i' }
      }).select('_id').lean();

      query.$or = [
        { userId: { $in: users.map(u => u._id) } },
        { projectId: { $in: projects.map(p => p._id) } }
      ];
    }

    const meetings = await Meeting.find(query)
      .populate('projectId', 'projectTitle')
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Meeting.countDocuments(query);

    res.status(200).json({
      success: true,
      data: meetings,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch meetings',
      error: error.message
    });
  }
};

// Cancel meeting
export const cancelMeeting = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const role = req.user.role;

    const meeting = await Meeting.findById(id);
    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }

    // Check permissions
    if (role !== 'admin' && meeting.userId.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to cancel this meeting'
      });
    }

    meeting.status = 'cancelled';
    await meeting.save();

    // Get project
    const project = await ClientProject.findById(meeting.projectId);

    // Create notification
    const notifyUserId = role === 'admin' ? meeting.userId : project.userId;
    await createNotification(
      notifyUserId,
      'meeting_scheduled',
      'Meeting Cancelled',
      `Meeting for project "${project.projectTitle}" has been cancelled`,
      meeting.projectId,
      meeting._id
    );

    res.status(200).json({
      success: true,
      message: 'Meeting cancelled successfully',
      data: meeting
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to cancel meeting',
      error: error.message
    });
  }
};

