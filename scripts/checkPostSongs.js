/**
 * Check post song URLs in the database.
 * Run from backend: node scripts/checkPostSongs.js
 * Requires .env with MONGODB_URI (or defaults to mongodb://localhost:27017/chatapp).
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Post from '../models/Post.js';

dotenv.config();

const run = async () => {
  try {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/chatapp';
    await mongoose.connect(uri);
    console.log('Connected to MongoDB\n');

    // 1) Posts that have a non-empty song URL (what we need for playback)
    const withValidSong = await Post.find({
      song: { $type: 'string', $regex: /^https?:\/\// }
    }, { _id: 1, song: 1, createdAt: 1 })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    console.log('=== Posts with valid song URL (https...) ===');
    if (withValidSong.length === 0) {
      console.log('None found.\n');
    } else {
      withValidSong.forEach((p, i) => {
        console.log(`${i + 1}. ${p._id}  song: ${(p.song || '').slice(0, 60)}...`);
      });
      console.log('');
    }

    // 2) Any post that has the song field at all (show raw value)
    const anyWithSongField = await Post.find(
      { song: { $exists: true } },
      { _id: 1, song: 1, sound: 1, createdAt: 1 }
    )
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    console.log('=== Sample of posts with song field (raw value) ===');
    if (anyWithSongField.length === 0) {
      console.log('No posts have a song field.\n');
    } else {
      anyWithSongField.forEach((p, i) => {
        const raw = p.song;
        const type = raw === null ? 'null' : typeof raw;
        const preview = type === 'string' ? JSON.stringify(raw.slice(0, 80)) : JSON.stringify(raw);
        console.log(`${i + 1}. Post ${p._id}`);
        console.log(`   song type: ${type}  value: ${preview}`);
        if (p.sound && (p.sound.video_id || p.sound.preview_url)) {
          console.log(`   sound (YouTube): ${p.sound.title || p.sound.video_id || 'yes'}`);
        }
        console.log('');
      });
    }

    // 3) Counts
    const totalWithSongKey = await Post.countDocuments({ song: { $exists: true } });
    const withNonEmptyString = await Post.countDocuments({
      song: { $type: 'string', $ne: '', $regex: /^https?:\/\// }
    });
    const withEmptyOrNull = await Post.countDocuments({
      $or: [
        { song: null },
        { song: '' },
        { song: { $exists: false } }
      ]
    });

    console.log('=== Counts ===');
    console.log(`Posts with song field present: ${totalWithSongKey}`);
    console.log(`Posts with valid song URL (https...): ${withNonEmptyString}`);
    console.log(`Posts with song null/empty/missing: ${withEmptyOrNull}`);
    console.log('');
    console.log('Conclusion: If "valid song URL" is 0, posts were never saved with a Cloudinary URL.');
    console.log('Fix: When creating a post with uploaded audio, the backend must set post.song = Cloudinary secure_url.');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
};

run();
