import DemoBooking from '../models/DemoBooking.js';
import { validationResult } from 'express-validator';

// Create demo booking
export const createDemoBooking = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { 
      projectId, 
      requirements, 
      preferredDate, 
      preferredTime,
      projectType,
      budget,
      deadline,
      contactPhone,
      contactEmail,
      additionalContactInfo
    } = req.body;
    const userId = req.user._id;

    // Check if user already has a pending booking for this project
    const existingBooking = await DemoBooking.findOne({
      userId,
      projectId,
      status: 'pending'
    });

    if (existingBooking) {
      return res.status(400).json({
        success: false,
        message: 'You already have a pending booking for this project'
      });
    }

    const booking = await DemoBooking.create({
      userId,
      projectId,
      requirements,
      preferredDate: preferredDate || null,
      preferredTime: preferredTime || null,
      projectType,
      budget,
      deadline,
      contactPhone: contactPhone || null,
      contactEmail: contactEmail || null,
      additionalContactInfo: additionalContactInfo || null,
      status: 'pending'
    });

    const populatedBooking = await DemoBooking.findById(booking._id)
      .populate('projectId', 'websiteTitle link')
      .populate('userId', 'name email');

    res.status(201).json({
      success: true,
      message: 'Demo booking request submitted successfully',
      data: populatedBooking
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create demo booking',
      error: error.message
    });
  }
};

// Get user's demo bookings
export const getUserBookings = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page = 1, limit = 10 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const bookings = await DemoBooking.find({ userId })
      .populate('projectId', 'websiteTitle link description images')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await DemoBooking.countDocuments({ userId });

    res.status(200).json({
      success: true,
      data: bookings,
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
      message: 'Failed to fetch bookings',
      error: error.message
    });
  }
};

