import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';

dotenv.config();

const migrateUserSubscription = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find all users without subscription field or with incomplete subscription
    const users = await User.find({
      $or: [
        { subscription: { $exists: false } },
        { 'subscription.badgeType': { $exists: false } },
        { 'subscription.subscriptionId': { $exists: false } }
      ]
    });

    console.log(`Found ${users.length} users to migrate`);

    // Update each user
    for (const user of users) {
      await User.findByIdAndUpdate(user._id, {
        $set: {
          'subscription.badgeType': null,
          'subscription.subscriptionId': null
        }
      }, { upsert: false });
    }

    console.log(`Successfully migrated ${users.length} users`);

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  } catch (error) {
    console.error('Migration error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
};

migrateUserSubscription();



