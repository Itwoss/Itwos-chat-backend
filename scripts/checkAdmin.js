import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import User from '../models/User.js';

dotenv.config();

const checkAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/chatapp');
    console.log('Connected to MongoDB');

    const email = 'admin@example.com';
    const password = 'admin123';

    // Find admin
    const admin = await User.findOne({ email, role: 'admin' });
    
    if (!admin) {
      console.log('❌ Admin user not found!');
      console.log('Creating admin user...');
      
      const hashedPassword = await bcrypt.hash(password, 10);
      const newAdmin = await User.create({
        name: 'Admin User',
        email: email,
        password: hashedPassword,
        countryCode: '91',
        phoneNumber: '1234567890',
        fullNumber: '911234567890',
        role: 'admin',
        isActive: true,
      });
      
      console.log('\n✅ Admin user created successfully!');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📧 Email:', newAdmin.email);
      console.log('🔑 Password:', password);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    } else {
      console.log('✅ Admin user found!');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📧 Email:', admin.email);
      console.log('👤 Name:', admin.name);
      console.log('🔐 Role:', admin.role);
      console.log('✅ Active:', admin.isActive);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      // Test password
      const isPasswordValid = await bcrypt.compare(password, admin.password);
      console.log('🔑 Password test:', isPasswordValid ? '✅ Valid' : '❌ Invalid');
      
      if (!isPasswordValid) {
        console.log('\n⚠️  Password mismatch! Resetting password...');
        const hashedPassword = await bcrypt.hash(password, 10);
        admin.password = hashedPassword;
        await admin.save();
        console.log('✅ Password reset successfully!');
        console.log('🔑 New Password:', password);
      }
    }

    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  } catch (error) {
    console.error('Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
};

checkAdmin();



