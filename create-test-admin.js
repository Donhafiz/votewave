/**
 * Create Test Admin User
 * Creates a test admin user with known credentials
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/votewave';

// User Schema
const userSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  email: String,
  password: String,
  role: String,
  isVerified: Boolean,
  createdAt: Date,
  updatedAt: Date
});

const User = mongoose.model('User', userSchema);

async function createTestAdmin() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Check if test admin already exists
    let user = await User.findOne({ email: 'testadmin@votewave.com' });
    
    if (user) {
      console.log('Test admin already exists, updating password...');
      user.password = await bcrypt.hash('TestAdmin@123', 10);
      user.role = 'admin';
      user.isVerified = true;
      await user.save();
      console.log('✅ Test admin password updated');
    } else {
      // Create new test admin
      const hashedPassword = await bcrypt.hash('TestAdmin@123', 10);
      user = new User({
        firstName: 'Test',
        lastName: 'Admin',
        email: 'testadmin@votewave.com',
        password: hashedPassword,
        role: 'admin',
        isVerified: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      await user.save();
      console.log('✅ Test admin user created');
    }

    console.log('\n🎯 Test Admin Credentials:');
    console.log('Email: testadmin@votewave.com');
    console.log('Password: TestAdmin@123');
    console.log('Role: admin');

    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

createTestAdmin();
