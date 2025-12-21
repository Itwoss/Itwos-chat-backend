import cron from 'node-cron';
import Story from '../models/Story.js';
import StoryInteraction from '../models/StoryInteraction.js';

// Delete expired stories (runs every hour)
export const deleteExpiredStories = async () => {
  try {
    const now = new Date();
    
    // Find all expired stories
    const expiredStories = await Story.find({
      expiresAt: { $lte: now },
      isActive: true,
    });

    if (expiredStories.length > 0) {
      const storyIds = expiredStories.map(s => s._id);
      
      // Mark stories as inactive
      await Story.updateMany(
        { _id: { $in: storyIds } },
        { $set: { isActive: false } }
      );

      // Optionally delete interactions (or keep for analytics)
      // await StoryInteraction.deleteMany({ story: { $in: storyIds } });

      console.log(`[Story Cron] Deactivated ${expiredStories.length} expired stories at ${now.toISOString()}`);
    }
  } catch (error) {
    console.error('[Story Cron] Error deleting expired stories:', error);
  }
};

// Start cron job
export const startStoryCron = () => {
  // Run every hour
  cron.schedule('0 * * * *', deleteExpiredStories, {
    scheduled: true,
    timezone: 'Asia/Kolkata',
  });
  
  console.log('[Story Cron] Started: checking for expired stories every hour.');
  
  // Run once on startup
  deleteExpiredStories();
};



