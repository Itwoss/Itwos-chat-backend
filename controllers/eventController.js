import Event from '../models/Event.js';
import { addCount } from '../services/countService.js';
import User from '../models/User.js';

/**
 * Create new event
 */
export const createEvent = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const { name, description, startDate, endDate, reward, applyToMonthly, applyToTotal } = req.body;

    if (!name || !startDate || !endDate || reward === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Name, startDate, endDate, and reward are required'
      });
    }

    const event = await Event.create({
      name,
      description,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      reward: parseInt(reward),
      applyToMonthly: applyToMonthly !== undefined ? applyToMonthly : true,
      applyToTotal: applyToTotal !== undefined ? applyToTotal : false,
      createdBy: req.user.id
    });

    res.status(201).json({
      success: true,
      message: 'Event created successfully',
      data: event
    });
  } catch (error) {
    console.error('[EventController] Error creating event:', error);
    res.status(500).json({ success: false, message: 'Failed to create event' });
  }
};

/**
 * Get all events
 */
export const getEvents = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const { isActive, page = 1, limit = 50 } = req.query;
    const query = {};

    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    const events = await Event.find(query)
      .populate('createdBy', 'name email')
      .populate('cancelledBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    const total = await Event.countDocuments(query);

    res.json({
      success: true,
      data: {
        events,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('[EventController] Error getting events:', error);
    res.status(500).json({ success: false, message: 'Failed to get events' });
  }
};

/**
 * Get active events (for users)
 */
export const getActiveEvents = async (req, res) => {
  try {
    const now = new Date();
    const events = await Event.find({
      isActive: true,
      isCancelled: false,
      startDate: { $lte: now },
      endDate: { $gte: now }
    })
      .select('name description startDate endDate reward')
      .sort({ startDate: 1 })
      .lean();

    res.json({
      success: true,
      data: events
    });
  } catch (error) {
    console.error('[EventController] Error getting active events:', error);
    res.status(500).json({ success: false, message: 'Failed to get active events' });
  }
};

/**
 * Complete event (user action)
 */
export const completeEvent = async (req, res) => {
  try {
    const userId = req.user.id;
    const { eventId } = req.body;

    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    if (!event.isActive || event.isCancelled) {
      return res.status(400).json({ success: false, message: 'Event is not active' });
    }

    const now = new Date();
    if (now < event.startDate || now > event.endDate) {
      return res.status(400).json({ success: false, message: 'Event is not currently active' });
    }

    // Check if already completed
    const alreadyCompleted = event.completions.some(
      c => c.user.toString() === userId.toString()
    );

    if (alreadyCompleted) {
      return res.status(400).json({ success: false, message: 'Event already completed' });
    }

    // Add completion
    event.completions.push({
      user: userId,
      completedAt: now,
      rewardApplied: false
    });

    // Apply reward
    if (event.applyToMonthly) {
      await addCount(userId, 'event', event.reward, {
        eventId: event._id,
        description: `Event completion: ${event.name}`
      });
    }

    if (event.applyToTotal) {
      const user = await User.findById(userId);
      if (user) {
        user.totalCount += event.reward;
        await user.save();
      }
    }

    // Mark reward as applied
    const completion = event.completions[event.completions.length - 1];
    completion.rewardApplied = true;

    await event.save();

    res.json({
      success: true,
      message: 'Event completed successfully',
      data: {
        reward: event.reward,
        completion: completion
      }
    });
  } catch (error) {
    console.error('[EventController] Error completing event:', error);
    res.status(500).json({ success: false, message: 'Failed to complete event' });
  }
};

/**
 * Cancel event (admin)
 */
export const cancelEvent = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const { eventId } = req.params;
    const { reason } = req.body;

    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    event.isCancelled = true;
    event.cancelledBy = req.user.id;
    event.cancelledAt = new Date();
    event.cancellationReason = reason;

    await event.save();

    res.json({
      success: true,
      message: 'Event cancelled successfully',
      data: event
    });
  } catch (error) {
    console.error('[EventController] Error cancelling event:', error);
    res.status(500).json({ success: false, message: 'Failed to cancel event' });
  }
};

/**
 * Update event (admin)
 */
export const updateEvent = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const { eventId } = req.params;
    const updates = req.body;

    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    Object.keys(updates).forEach(key => {
      if (['name', 'description', 'startDate', 'endDate', 'reward', 'applyToMonthly', 'applyToTotal', 'isActive'].includes(key)) {
        if (key === 'startDate' || key === 'endDate') {
          event[key] = new Date(updates[key]);
        } else {
          event[key] = updates[key];
        }
      }
    });

    await event.save();

    res.json({
      success: true,
      message: 'Event updated successfully',
      data: event
    });
  } catch (error) {
    console.error('[EventController] Error updating event:', error);
    res.status(500).json({ success: false, message: 'Failed to update event' });
  }
};

