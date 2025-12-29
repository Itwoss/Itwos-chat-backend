import AdminRuleConfig from '../models/AdminRuleConfig.js';

/**
 * Get current rule configuration
 */
export const getRules = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const config = await AdminRuleConfig.getConfig();

    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error('[AdminRuleController] Error getting rules:', error);
    console.error('[AdminRuleController] Error stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get rules',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Update rule configuration
 */
export const updateRules = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const config = await AdminRuleConfig.getConfig();

    // Update fields from request body
    const updates = req.body;
    
    // Update nested objects
    if (updates.fridayMultiplier) {
      config.fridayMultiplier = {
        ...config.fridayMultiplier,
        ...updates.fridayMultiplier
      };
    }

    if (updates.milestoneRewards) {
      config.milestoneRewards = {
        ...config.milestoneRewards,
        ...updates.milestoneRewards
      };
    }

    if (updates.spamDetection) {
      config.spamDetection = {
        ...config.spamDetection,
        ...updates.spamDetection
      };
    }

    // Update top-level fields
    Object.keys(updates).forEach(key => {
      if (!['fridayMultiplier', 'milestoneRewards', 'spamDetection'].includes(key)) {
        if (updates[key] !== undefined) {
          config[key] = updates[key];
        }
      }
    });

    config.lastUpdatedBy = req.user.id;
    config.lastUpdatedAt = new Date();

    await config.save();

    res.json({
      success: true,
      message: 'Rules updated successfully',
      data: config
    });
  } catch (error) {
    console.error('[AdminRuleController] Error updating rules:', error);
    res.status(500).json({ success: false, message: 'Failed to update rules' });
  }
};

/**
 * Toggle rule enabled/disabled
 */
export const toggleRule = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const { enabled } = req.body;
    const config = await AdminRuleConfig.getConfig();

    config.enabled = enabled !== undefined ? enabled : !config.enabled;
    config.lastUpdatedBy = req.user.id;
    config.lastUpdatedAt = new Date();

    await config.save();

    res.json({
      success: true,
      message: `Count system ${config.enabled ? 'enabled' : 'disabled'}`,
      data: { enabled: config.enabled }
    });
  } catch (error) {
    console.error('[AdminRuleController] Error toggling rule:', error);
    res.status(500).json({ success: false, message: 'Failed to toggle rule' });
  }
};

