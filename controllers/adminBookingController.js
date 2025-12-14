import DemoBooking from '../models/DemoBooking.js';
import User from '../models/User.js';
import Project from '../models/Project.js';

// Get all demo bookings (admin only)
export const getAllBookings = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', status = '' } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build query
    const query = {};

    // Search by user name or email, or project title
    if (search) {
      const users = await User.find({
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ]
      }).select('_id');

      const projects = await Project.find({
        websiteTitle: { $regex: search, $options: 'i' }
      }).select('_id');

      query.$or = [
        { userId: { $in: users.map(u => u._id) } },
        { projectId: { $in: projects.map(p => p._id) } }
      ];
    }

    // Filter by status
    if (status) {
      query.status = status;
    }

    const bookings = await DemoBooking.find(query)
      .populate('userId', 'name email phoneNumber countryCode profileImage')
      .populate('projectId', 'websiteTitle link description images status')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await DemoBooking.countDocuments(query);

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

// Get booking by ID
export const getBookingById = async (req, res) => {
  try {
    const { id } = req.params;

    const booking = await DemoBooking.findById(id)
      .populate('userId', 'name email phoneNumber countryCode fullNumber profileImage')
      .populate('projectId', 'websiteTitle link description images techStack teamMembers status startDate endDate');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    res.status(200).json({
      success: true,
      data: booking
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch booking',
      error: error.message
    });
  }
};

// Update booking status
export const updateBookingStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminNotes } = req.body;

    const booking = await DemoBooking.findById(id);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    if (status) {
      const validStatuses = ['pending', 'confirmed', 'cancelled', 'completed'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status'
        });
      }
      booking.status = status;
    }

    if (adminNotes !== undefined) {
      booking.adminNotes = adminNotes;
    }

    await booking.save();

    const updatedBooking = await DemoBooking.findById(id)
      .populate('userId', 'name email phoneNumber countryCode profileImage')
      .populate('projectId', 'websiteTitle link description images status');

    res.status(200).json({
      success: true,
      message: 'Booking updated successfully',
      data: updatedBooking
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update booking',
      error: error.message
    });
  }
};

// Delete booking
export const deleteBooking = async (req, res) => {
  try {
    const { id } = req.params;

    const booking = await DemoBooking.findById(id);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    await DemoBooking.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Booking deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete booking',
      error: error.message
    });
  }
};

