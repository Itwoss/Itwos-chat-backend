import ClientProject from '../models/ClientProject.js';
import DemoBooking from '../models/DemoBooking.js';
import User from '../models/User.js';
import { validationResult } from 'express-validator';
import { createNotification } from './notificationController.js';

// Convert booking to client project (Admin only)
export const convertBookingToProject = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { bookingId, projectTitle, description, techStack, teamMembers } = req.body;

    // Check if booking exists and is confirmed
    const booking = await DemoBooking.findById(bookingId)
      .populate('userId', 'name email')
      .populate('projectId', 'websiteTitle');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    if (booking.status !== 'confirmed') {
      return res.status(400).json({
        success: false,
        message: 'Only confirmed bookings can be converted to projects'
      });
    }

    // Check if project already exists for this booking
    const existingProject = await ClientProject.findOne({ bookingId });
    if (existingProject) {
      return res.status(400).json({
        success: false,
        message: 'Project already exists for this booking'
      });
    }

    // Create client project from booking
    const clientProject = await ClientProject.create({
      bookingId: booking._id,
      userId: booking.userId._id,
      projectTitle: projectTitle || booking.projectId?.websiteTitle || 'New Project',
      description: description || booking.requirements,
      projectType: booking.projectType,
      budget: booking.budget,
      deadline: booking.deadline,
      requirements: booking.requirements,
      techStack: techStack || [],
      teamMembers: teamMembers || [],
      status: 'planning',
      progress: 0,
      startDate: new Date()
    });

    const populatedProject = await ClientProject.findById(clientProject._id)
      .populate('userId', 'name email')
      .populate('bookingId')
      .populate('teamMembers', 'name role image');

    res.status(201).json({
      success: true,
      message: 'Booking converted to project successfully',
      data: populatedProject
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to convert booking to project',
      error: error.message
    });
  }
};

// Get all client projects (Admin)
export const getAllClientProjects = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', status = '', userId = '' } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = {};

    if (search) {
      query.$or = [
        { projectTitle: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    if (status) {
      query.status = status;
    }

    if (userId) {
      query.userId = userId;
    }

    const projects = await ClientProject.find(query)
      .populate('userId', 'name email profileImage')
      .populate('bookingId', 'requirements projectType budget deadline')
      .populate('teamMembers', 'name role image')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await ClientProject.countDocuments(query);

    res.status(200).json({
      success: true,
      data: projects,
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
      message: 'Failed to fetch client projects',
      error: error.message
    });
  }
};

// Get client project by ID
export const getClientProjectById = async (req, res) => {
  try {
    const { id } = req.params;

    const project = await ClientProject.findById(id)
      .populate('userId', 'name email phoneNumber countryCode profileImage')
      .populate('bookingId')
      .populate('teamMembers', 'name role image socialLinks');

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    res.status(200).json({
      success: true,
      data: project
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch project',
      error: error.message
    });
  }
};

// Update client project (Admin)
export const updateClientProject = async (req, res) => {
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
    const updateData = req.body;

    const project = await ClientProject.findById(id);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    // Track changes for activity timeline
    const oldStatus = project.status;
    const oldProgress = project.progress;

    // Update fields
    if (updateData.projectTitle) {
      project.projectTitle = updateData.projectTitle;
      project.activityTimeline.push({
        type: 'note_added',
        title: 'Project Title Updated',
        description: `Title changed to: ${updateData.projectTitle}`,
        performedBy: 'admin',
        createdAt: new Date()
      });
    }
    if (updateData.description !== undefined) {
      project.description = updateData.description;
    }
    if (updateData.status && updateData.status !== oldStatus) {
      project.activityTimeline.push({
        type: 'status_change',
        title: 'Status Changed',
        description: `Status changed from ${oldStatus} to ${updateData.status}`,
        performedBy: 'admin',
        oldValue: oldStatus,
        newValue: updateData.status,
        createdAt: new Date()
      });
      project.status = updateData.status;

      // Create notification for client
      await createNotification(
        project.userId,
        'status_change',
        'Project Status Updated',
        `Your project "${project.projectTitle}" status has been changed to ${updateData.status}`,
        project._id,
        null,
        `/user/client-projects/${project._id}`
      );
    }
    if (updateData.progress !== undefined && updateData.progress !== oldProgress) {
      project.activityTimeline.push({
        type: 'progress_update',
        title: 'Progress Updated',
        description: `Progress changed from ${oldProgress}% to ${updateData.progress}%`,
        performedBy: 'admin',
        oldValue: `${oldProgress}%`,
        newValue: `${updateData.progress}%`,
        createdAt: new Date()
      });
      project.progress = updateData.progress;

      // Create notification for client
      await createNotification(
        project.userId,
        'project_update',
        'Project Progress Updated',
        `Your project "${project.projectTitle}" progress is now ${updateData.progress}%`,
        project._id,
        null,
        `/user/client-projects/${project._id}`
      );
    }
    if (updateData.techStack) project.techStack = updateData.techStack;
    if (updateData.teamMembers) project.teamMembers = updateData.teamMembers;
    if (updateData.adminNotes !== undefined && updateData.adminNotes !== project.adminNotes) {
      project.activityTimeline.push({
        type: 'note_added',
        title: 'Admin Note Added',
        description: 'Admin added a note to the project',
        performedBy: 'admin',
        createdAt: new Date()
      });
      project.adminNotes = updateData.adminNotes;

      // Create notification for client
      await createNotification(
        project.userId,
        'note_added',
        'New Admin Note',
        `Admin added a note to your project "${project.projectTitle}"`,
        project._id,
        null,
        `/user/client-projects/${project._id}`
      );
    }
    if (updateData.deadline) project.deadline = updateData.deadline;
    if (updateData.startDate) project.startDate = updateData.startDate;
    if (updateData.completedDate) project.completedDate = updateData.completedDate;

    // Handle milestones
    if (updateData.milestones) {
      project.milestones = updateData.milestones;
    }

    await project.save();

    const updatedProject = await ClientProject.findById(id)
      .populate('userId', 'name email profileImage')
      .populate('bookingId')
      .populate('teamMembers', 'name role image');

    res.status(200).json({
      success: true,
      message: 'Project updated successfully',
      data: updatedProject
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update project',
      error: error.message
    });
  }
};

// Get user's client projects
export const getUserClientProjects = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page = 1, limit = 10, search = '' } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = { userId, isActive: true };
    
    if (search) {
      query.$or = [
        { projectTitle: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const projects = await ClientProject.find(query)
      .populate('bookingId', 'requirements projectType budget deadline')
      .populate('teamMembers', 'name role image')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await ClientProject.countDocuments(query);

    res.status(200).json({
      success: true,
      data: projects,
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
      message: 'Failed to fetch projects',
      error: error.message
    });
  }
};

// Add client note to project
export const addClientNote = async (req, res) => {
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
    const { note } = req.body;
    const userId = req.user._id;

    const project = await ClientProject.findById(id);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    if (project.userId.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to add notes to this project'
      });
    }

    project.clientNotes.push({ note });
    
    // Add to activity timeline
    project.activityTimeline.push({
      type: 'note_added',
      title: 'Client Note Added',
      description: 'Client added a note to the project',
      performedBy: 'client',
      createdAt: new Date()
    });
    
    await project.save();

    // Create notification for all admins
    const { createAdminNotification } = await import('./notificationController.js');
    await createAdminNotification(
      'note_added',
      'New Client Note',
      `Client added a note to project "${project.projectTitle}"`,
      projectId,
      null,
      `/admin/client-projects/${projectId}`
    );

    res.status(200).json({
      success: true,
      message: 'Note added successfully',
      data: project
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to add note',
      error: error.message
    });
  }
};

// Delete client project (Admin)
export const deleteClientProject = async (req, res) => {
  try {
    const { id } = req.params;

    const project = await ClientProject.findById(id);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    await ClientProject.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Project deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete project',
      error: error.message
    });
  }
};

