import Project from '../models/Project.js';
import Team from '../models/Team.js';
import { validationResult } from 'express-validator';
import cloudinary from '../utils/cloudinary.js';

// Get all projects
export const getAllProjects = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', isActive = '' } = req.query;
    
    const query = {};
    
    if (isActive !== '') {
      query.isActive = isActive === 'true';
    }
    
    if (search) {
      query.$or = [
        { websiteTitle: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const projects = await Project.find(query)
      .populate('teamMembers', 'name role image')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Project.countDocuments(query);

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

// Get single project by ID
export const getProjectById = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate('teamMembers', 'name role image');
    
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

// Create project
export const createProject = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { websiteTitle, link, description, techStack, teamMembers, status, startDate, endDate } = req.body;
    
    // Parse techStack and teamMembers if they are strings
    const techStackArray = typeof techStack === 'string' 
      ? JSON.parse(techStack) 
      : (Array.isArray(techStack) ? techStack : []);
    
    const teamMembersArray = typeof teamMembers === 'string'
      ? JSON.parse(teamMembers)
      : (Array.isArray(teamMembers) ? teamMembers : []);

    // Upload images and files to Cloudinary
    const imageUrls = [];
    const fileUrls = [];

    if (req.files) {
      const fs = await import('fs');
      for (const file of req.files) {
        try {
          const result = await cloudinary.uploader.upload(file.path, {
            folder: 'chat-app/projects',
          });
          
          // Determine if it's an image or file based on mimetype
          if (file.mimetype.startsWith('image/')) {
            imageUrls.push(result.secure_url);
          } else {
            fileUrls.push(result.secure_url);
          }
          // Delete temporary file
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        } catch (uploadError) {
          console.error('Error uploading file:', uploadError);
        }
      }
    }

    const projectData = {
      websiteTitle,
      link,
      description,
      techStack: techStackArray,
      teamMembers: teamMembersArray,
      images: imageUrls,
      files: fileUrls,
      isActive: true,
      status: status || 'planning',
      startDate: startDate || null,
      endDate: endDate || null
    };

    const project = await Project.create(projectData);
    const populatedProject = await Project.findById(project._id)
      .populate('teamMembers', 'name role image');

    res.status(201).json({
      success: true,
      message: 'Project created successfully',
      data: populatedProject
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create project',
      error: error.message
    });
  }
};

// Update project
export const updateProject = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const projectId = req.params.id;
    const project = await Project.findById(projectId);
    
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    const { websiteTitle, link, description, techStack, teamMembers, isActive, status, startDate, endDate } = req.body;

    // Update fields
    if (websiteTitle) project.websiteTitle = websiteTitle;
    if (link) project.link = link;
    if (description) project.description = description;
    if (typeof isActive === 'boolean') project.isActive = isActive;
    if (status) project.status = status;
    if (startDate) project.startDate = startDate;
    if (endDate) project.endDate = endDate;
    
    if (techStack) {
      project.techStack = typeof techStack === 'string'
        ? JSON.parse(techStack)
        : (Array.isArray(techStack) ? techStack : []);
    }
    
    if (teamMembers) {
      project.teamMembers = typeof teamMembers === 'string'
        ? JSON.parse(teamMembers)
        : (Array.isArray(teamMembers) ? teamMembers : []);
    }

    // Handle new file uploads
    if (req.files && req.files.length > 0) {
      const fs = await import('fs');
      const newImageUrls = [];
      const newFileUrls = [];

      for (const file of req.files) {
        try {
          const result = await cloudinary.uploader.upload(file.path, {
            folder: 'chat-app/projects',
          });
          
          if (file.mimetype.startsWith('image/')) {
            newImageUrls.push(result.secure_url);
          } else {
            newFileUrls.push(result.secure_url);
          }
          // Delete temporary file
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        } catch (uploadError) {
          console.error('Error uploading file:', uploadError);
        }
      }

      // Append new files to existing ones
      project.images = [...project.images, ...newImageUrls];
      project.files = [...project.files, ...newFileUrls];
    }

    await project.save();
    const populatedProject = await Project.findById(projectId)
      .populate('teamMembers', 'name role image');

    res.status(200).json({
      success: true,
      message: 'Project updated successfully',
      data: populatedProject
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update project',
      error: error.message
    });
  }
};

// Delete project
export const deleteProject = async (req, res) => {
  try {
    const projectId = req.params.id;
    const project = await Project.findById(projectId);
    
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    // Delete all images and files from Cloudinary
    const allFiles = [...project.images, ...project.files];
    for (const fileUrl of allFiles) {
      try {
        const publicId = fileUrl.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(`chat-app/projects/${publicId}`);
      } catch (error) {
        console.error('Error deleting file from Cloudinary:', error);
      }
    }

    await Project.findByIdAndDelete(projectId);

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

// Delete specific image/file from project
export const deleteProjectFile = async (req, res) => {
  try {
    const { projectId, fileUrl } = req.params;
    const project = await Project.findById(projectId);
    
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    // Remove from images or files array
    project.images = project.images.filter(img => img !== fileUrl);
    project.files = project.files.filter(file => file !== fileUrl);

    // Delete from Cloudinary
    try {
      const publicId = fileUrl.split('/').pop().split('.')[0];
      await cloudinary.uploader.destroy(`chat-app/projects/${publicId}`);
    } catch (error) {
      console.error('Error deleting file from Cloudinary:', error);
    }

    await project.save();

    res.status(200).json({
      success: true,
      message: 'File deleted successfully',
      data: project
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete file',
      error: error.message
    });
  }
};

