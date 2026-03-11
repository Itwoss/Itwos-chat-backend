import Team from '../models/Team.js';
import { validationResult } from 'express-validator';
import cloudinary from '../utils/cloudinary.js';

// Get all team members
export const getAllTeams = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', isActive = '', noPagination = false } = req.query;
    
    const query = {};
    
    if (isActive !== '') {
      query.isActive = isActive === 'true';
    }
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { role: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    let teams, total;

    if (noPagination === 'true' || noPagination === true) {
      // Return all teams without pagination (for selects)
      teams = await Team.find(query)
        .sort({ createdAt: -1 });
      total = teams.length;
    } else {
      const skip = (parseInt(page) - 1) * parseInt(limit);
      teams = await Team.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));
      total = await Team.countDocuments(query);
    }

    res.status(200).json({
      success: true,
      data: teams,
      pagination: noPagination ? null : {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch team members',
      error: error.message
    });
  }
};

// Get single team member by ID
export const getTeamById = async (req, res) => {
  try {
    const team = await Team.findById(req.params.id);
    
    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Team member not found'
      });
    }

    res.status(200).json({
      success: true,
      data: team
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch team member',
      error: error.message
    });
  }
};

// Create team member
export const createTeam = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { name, role, email, bio, socialLinks } = req.body;
    let imageUrl = '';

    // Upload image to Cloudinary if provided
    if (req.file) {
      try {
        const fs = await import('fs');
        const result = await cloudinary.uploader.upload(req.file.path, {
          folder: 'chat-app/team',
        });
        imageUrl = result.secure_url;
        // Delete temporary file
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
      } catch (uploadError) {
        return res.status(500).json({
          success: false,
          message: 'Failed to upload image',
          error: uploadError.message
        });
      }
    }

    const teamData = {
      name,
      role,
      email: email || '',
      bio: bio || '',
      image: imageUrl,
      socialLinks: socialLinks ? JSON.parse(socialLinks) : {},
      isActive: true
    };

    const team = await Team.create(teamData);

    res.status(201).json({
      success: true,
      message: 'Team member created successfully',
      data: team
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create team member',
      error: error.message
    });
  }
};

// Update team member
export const updateTeam = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const teamId = req.params.id;
    const team = await Team.findById(teamId);
    
    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Team member not found'
      });
    }

    const { name, role, email, bio, socialLinks, isActive } = req.body;

    // Update fields
    if (name) team.name = name;
    if (role) team.role = role;
    if (email !== undefined) team.email = email;
    if (bio !== undefined) team.bio = bio;
    if (typeof isActive === 'boolean') team.isActive = isActive;
    if (socialLinks) {
      team.socialLinks = typeof socialLinks === 'string' ? JSON.parse(socialLinks) : socialLinks;
    }

    // Handle image upload if new file is provided
    if (req.file) {
      try {
        // Delete old image from Cloudinary if exists
        if (team.image) {
          const publicId = team.image.split('/').pop().split('.')[0];
          await cloudinary.uploader.destroy(`chat-app/team/${publicId}`);
        }

        // Upload new image
        const fs = await import('fs');
        const result = await cloudinary.uploader.upload(req.file.path, {
          folder: 'chat-app/team',
        });
        team.image = result.secure_url;
        // Delete temporary file
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
      } catch (uploadError) {
        return res.status(500).json({
          success: false,
          message: 'Failed to upload image',
          error: uploadError.message
        });
      }
    }

    await team.save();

    res.status(200).json({
      success: true,
      message: 'Team member updated successfully',
      data: team
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update team member',
      error: error.message
    });
  }
};

// Delete team member
export const deleteTeam = async (req, res) => {
  try {
    const teamId = req.params.id;
    const team = await Team.findById(teamId);
    
    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Team member not found'
      });
    }

    // Delete image from Cloudinary if exists
    if (team.image) {
      try {
        const publicId = team.image.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(`chat-app/team/${publicId}`);
      } catch (error) {
        console.error('Error deleting image from Cloudinary:', error);
      }
    }

    await Team.findByIdAndDelete(teamId);

    res.status(200).json({
      success: true,
      message: 'Team member deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete team member',
      error: error.message
    });
  }
};

