import mongoose from 'mongoose';
import ProfileReport from '../models/ProfileReport.js';
import User from '../models/User.js';
import { createAdminNotification } from './notificationController.js';

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

export const createProfileReport = async (req, res) => {
  try {
    const reportedUserId = req.params.userId;
    const reportedById = req.user?._id;
    const { reason } = req.body || {};

    if (!reportedById) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (!isValidObjectId(reportedUserId)) {
      return res.status(400).json({ success: false, message: 'Invalid user id' });
    }

    if (!reason) {
      return res.status(400).json({ success: false, message: 'Reason is required' });
    }

    if (String(reportedById) === String(reportedUserId)) {
      return res.status(400).json({ success: false, message: 'You cannot report your own profile' });
    }

    const reportedUser = await User.findById(reportedUserId).select('_id name email');
    if (!reportedUser) {
      return res.status(404).json({ success: false, message: 'Reported user not found' });
    }

    const report = await ProfileReport.create({
      reportedUser: reportedUserId,
      reportedBy: reportedById,
      reason,
    });

    await createAdminNotification(
      'profile-report',
      'New profile report',
      `${req.user?.name || 'A user'} reported ${reportedUser.name || 'a profile'} for "${reason}"`,
      null,
      null,
      `/admin/profile-reports/${report._id}`
    );

    return res.status(201).json({
      success: true,
      message: 'Profile reported successfully',
      data: report,
    });
  } catch (error) {
    console.error('createProfileReport error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to report profile',
      error: error.message,
    });
  }
};

export const getAdminProfileReports = async (req, res) => {
  try {
    const { status } = req.query || {};
    const filter = {};
    if (status && ['pending', 'reviewed'].includes(status)) filter.status = status;

    const reports = await ProfileReport.find(filter)
      .populate('reportedUser', 'name email profileImage role')
      .populate('reportedBy', 'name email profileImage')
      .populate('reviewedBy', 'name email')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: reports.length,
      data: reports,
    });
  } catch (error) {
    console.error('getAdminProfileReports error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch profile reports',
      error: error.message,
    });
  }
};

export const reviewAdminProfileReport = async (req, res) => {
  try {
    const { reportId } = req.params;

    if (!isValidObjectId(reportId)) {
      return res.status(400).json({ success: false, message: 'Invalid report id' });
    }

    const report = await ProfileReport.findByIdAndUpdate(
      reportId,
      {
        status: 'reviewed',
        reviewedAt: new Date(),
        reviewedBy: req.user?._id || null,
      },
      { new: true }
    )
      .populate('reportedUser', 'name email profileImage role')
      .populate('reportedBy', 'name email profileImage')
      .populate('reviewedBy', 'name email');

    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    return res.status(200).json({
      success: true,
      message: 'Profile report reviewed',
      data: report,
    });
  } catch (error) {
    console.error('reviewAdminProfileReport error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to review profile report',
      error: error.message,
    });
  }
};
