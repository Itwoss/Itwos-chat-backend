import SupportTicket from '../models/SupportTicket.js';
import User from '../models/User.js';

/**
 * User: Create a support ticket
 */
export const createSupportTicket = async (req, res) => {
  try {
    const userId = req.user.id;
    const { subject, message, category, priority, attachments } = req.body;

    if (!subject || !message) {
      return res.status(400).json({
        success: false,
        message: 'Subject and message are required'
      });
    }

    const ticket = await SupportTicket.create({
      user: userId,
      subject: subject.trim(),
      message: message.trim(),
      category: category || 'other',
      priority: priority || 'medium',
      attachments: attachments || [],
      status: 'open',
      lastActivityAt: new Date()
    });

    const populatedTicket = await SupportTicket.findById(ticket._id)
      .populate('user', 'name email profileImage')
      .lean();

    // Emit real-time notification to admins
    const io = req.app.get('io');
    if (io) {
      io.to('admin').emit('new-support-ticket', {
        ticket: populatedTicket,
        message: `New support ticket from ${req.user.name}`
      });
      io.to('admin-room').emit('new-support-ticket', {
        ticket: populatedTicket,
        message: `New support ticket from ${req.user.name}`
      });
    }

    res.status(201).json({
      success: true,
      message: 'Support ticket created successfully',
      data: populatedTicket
    });
  } catch (error) {
    console.error('[SupportController] Error creating ticket:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create support ticket',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * User: Get their own support tickets
 */
export const getUserTickets = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const query = { user: userId };
    if (status) {
      query.status = status;
    }

    const tickets = await SupportTicket.find(query)
      .populate('resolvedBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip)
      .lean();

    const total = await SupportTicket.countDocuments(query);

    res.json({
      success: true,
      data: {
        tickets,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('[SupportController] Error getting user tickets:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get support tickets'
    });
  }
};

/**
 * User: Get a single ticket
 */
export const getTicketById = async (req, res) => {
  try {
    const userId = req.user.id;
    const { ticketId } = req.params;

    const ticket = await SupportTicket.findOne({
      _id: ticketId,
      user: userId
    })
      .populate('user', 'name email profileImage')
      .populate('responses.user', 'name email profileImage role')
      .populate('resolvedBy', 'name email')
      .lean();

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    res.json({
      success: true,
      data: ticket
    });
  } catch (error) {
    console.error('[SupportController] Error getting ticket:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get ticket'
    });
  }
};

/**
 * User: Add response to ticket
 */
export const addTicketResponse = async (req, res) => {
  try {
    const userId = req.user.id;
    const { ticketId } = req.params;
    const { message, attachments } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }

    const ticket = await SupportTicket.findOne({
      _id: ticketId,
      user: userId
    });

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    if (ticket.status === 'closed') {
      return res.status(400).json({
        success: false,
        message: 'Cannot add response to closed ticket'
      });
    }

    ticket.responses.push({
      user: userId,
      message: message.trim(),
      isAdmin: false,
      attachments: attachments || []
    });

    ticket.lastActivityAt = new Date();
    if (ticket.status === 'resolved') {
      ticket.status = 'open'; // Reopen if user responds to resolved ticket
    }

    await ticket.save();

    // Emit notification to admins
    const io = req.app.get('io');
    if (io) {
      io.to('admin').emit('support-ticket-updated', {
        ticketId: ticket._id,
        message: `New response from ${req.user.name} on ticket: ${ticket.subject}`
      });
      io.to('admin-room').emit('support-ticket-updated', {
        ticketId: ticket._id,
        message: `New response from ${req.user.name} on ticket: ${ticket.subject}`
      });
    }

    const updatedTicket = await SupportTicket.findById(ticket._id)
      .populate('user', 'name email profileImage')
      .populate('responses.user', 'name email profileImage role')
      .lean();

    res.json({
      success: true,
      message: 'Response added successfully',
      data: updatedTicket
    });
  } catch (error) {
    console.error('[SupportController] Error adding response:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add response'
    });
  }
};

/**
 * Admin: Get all support tickets
 */
export const getAllTickets = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    const {
      status,
      priority,
      category,
      search,
      page = 1,
      limit = 50
    } = req.query;
    const skip = (page - 1) * limit;

    const query = {};
    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (category) query.category = category;
    if (search) {
      query.$or = [
        { subject: { $regex: search, $options: 'i' } },
        { message: { $regex: search, $options: 'i' } }
      ];
    }

    const tickets = await SupportTicket.find(query)
      .populate('user', 'name email profileImage')
      .populate('resolvedBy', 'name email')
      .sort({ priority: -1, createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip)
      .lean();

    const total = await SupportTicket.countDocuments(query);

    // Get stats
    const stats = {
      open: await SupportTicket.countDocuments({ status: 'open' }),
      in_progress: await SupportTicket.countDocuments({ status: 'in_progress' }),
      resolved: await SupportTicket.countDocuments({ status: 'resolved' }),
      closed: await SupportTicket.countDocuments({ status: 'closed' }),
      urgent: await SupportTicket.countDocuments({ priority: 'urgent', status: { $ne: 'closed' } })
    };

    res.json({
      success: true,
      data: {
        tickets,
        stats,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('[SupportController] Error getting all tickets:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get tickets'
    });
  }
};

/**
 * Admin: Get a single ticket (with all details)
 */
export const getAdminTicketById = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    const { ticketId } = req.params;

    const ticket = await SupportTicket.findById(ticketId)
      .populate('user', 'name email profileImage phoneNumber countryCode')
      .populate('responses.user', 'name email profileImage role')
      .populate('resolvedBy', 'name email')
      .lean();

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    res.json({
      success: true,
      data: ticket
    });
  } catch (error) {
    console.error('[SupportController] Error getting admin ticket:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get ticket'
    });
  }
};

/**
 * Admin: Add response to ticket
 */
export const addAdminResponse = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    const { ticketId } = req.params;
    const { message, attachments, changeStatus } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }

    const ticket = await SupportTicket.findById(ticketId);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    ticket.responses.push({
      user: req.user.id,
      message: message.trim(),
      isAdmin: true,
      attachments: attachments || []
    });

    if (changeStatus && ['open', 'in_progress', 'resolved', 'closed'].includes(changeStatus)) {
      ticket.status = changeStatus;
      if (changeStatus === 'resolved' || changeStatus === 'closed') {
        ticket.resolvedBy = req.user.id;
        ticket.resolvedAt = new Date();
        if (req.body.resolutionNotes) {
          ticket.resolutionNotes = req.body.resolutionNotes;
        }
      }
    }

    ticket.lastActivityAt = new Date();
    await ticket.save();

    // Emit notification to user
    const io = req.app.get('io');
    if (io) {
      io.to(`user-${ticket.user}`).emit('support-ticket-response', {
        ticketId: ticket._id,
        message: `Admin responded to your support ticket: ${ticket.subject}`
      });
    }

    const updatedTicket = await SupportTicket.findById(ticket._id)
      .populate('user', 'name email profileImage')
      .populate('responses.user', 'name email profileImage role')
      .populate('resolvedBy', 'name email')
      .lean();

    res.json({
      success: true,
      message: 'Response added successfully',
      data: updatedTicket
    });
  } catch (error) {
    console.error('[SupportController] Error adding admin response:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add response'
    });
  }
};

/**
 * Admin: Update ticket status
 */
export const updateTicketStatus = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    const { ticketId } = req.params;
    const { status, resolutionNotes } = req.body;

    if (!['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    const ticket = await SupportTicket.findById(ticketId);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    ticket.status = status;
    if (status === 'resolved' || status === 'closed') {
      ticket.resolvedBy = req.user.id;
      ticket.resolvedAt = new Date();
      if (resolutionNotes) {
        ticket.resolutionNotes = resolutionNotes;
      }
    }

    ticket.lastActivityAt = new Date();
    await ticket.save();

    // Emit notification to user
    const io = req.app.get('io');
    if (io) {
      io.to(`user-${ticket.user}`).emit('support-ticket-status-updated', {
        ticketId: ticket._id,
        status: status,
        message: `Your support ticket status changed to: ${status}`
      });
    }

    const updatedTicket = await SupportTicket.findById(ticket._id)
      .populate('user', 'name email profileImage')
      .populate('resolvedBy', 'name email')
      .lean();

    res.json({
      success: true,
      message: 'Ticket status updated successfully',
      data: updatedTicket
    });
  } catch (error) {
    console.error('[SupportController] Error updating ticket status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update ticket status'
    });
  }
};

