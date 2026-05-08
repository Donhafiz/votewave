/**
 * Reset Users Script
 * Run this to delete all users or a specific user from MongoDB
 * 
 * Usage:
 *   node reset-users.js              - Delete ALL users
 *   node reset-users.js EMAIL        - Delete specific user by email
 *   node reset-users.js --list       - List all users
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/votewave';

// User Schema (simplified for script)
const userSchema = new mongoose.Schema({
  email: String,
  firstName: String,
  lastName: String,
  role: String,
  isVerified: Boolean,
  createdAt: Date
});

const User = mongoose.model('User', userSchema);

async function main() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const args = process.argv.slice(2);
    const command = args[0];

    if (command === '--list' || command === '-l') {
      // List all users
      const users = await User.find({}, 'email firstName lastName role isVerified createdAt');
      console.log('\n📋 All Users:');
      console.log('================================');
      if (users.length === 0) {
        console.log('No users found.');
      } else {
        users.forEach((user, i) => {
          console.log(`${i + 1}. ${user.email}`);
          console.log(`   Name: ${user.firstName} ${user.lastName}`);
          console.log(`   Role: ${user.role}`);
          console.log(`   Verified: ${user.isVerified}`);
          console.log(`   Created: ${user.createdAt}`);
          console.log('');
        });
      }
      console.log(`Total: ${users.length} users`);
    } else if (command && command.includes('@')) {
      // Delete specific user by email
      const email = command.toLowerCase().trim();
      console.log(`\n🔍 Looking for user: ${email}`);
      
      const user = await User.findOne({ email });
      if (!user) {
        console.log('❌ User not found');
        return;
      }
      
      console.log(`Found: ${user.firstName} ${user.lastName} (${user.role})`);
      console.log('🗑️  Deleting user...');
      
      await User.deleteOne({ email });
      console.log('✅ User deleted successfully!');
    } else if (command === '--help' || command === '-h') {
      console.log(`
Usage:
  node reset-users.js              - Delete ALL users
  node reset-users.js EMAIL        - Delete specific user by email
  node reset-users.js --list       - List all users
  node reset-users.js --help       - Show this help

Examples:
  node reset-users.js --list
  node reset-users.js admin@votewave.com
  node reset-users.js
      `);
    } else {
      // Delete all users (with confirmation)
      const count = await User.countDocuments();
      if (count === 0) {
        console.log('No users to delete.');
        return;
      }
      
      console.log(`\n⚠️  WARNING: About to delete ALL ${count} users!`);
      console.log('This action cannot be undone.');
      console.log('\nTo confirm, run: node reset-users.js --confirm-delete-all');
      
      // Show users that will be deleted
      const users = await User.find({}, 'email firstName lastName role');
      console.log('\nUsers to be deleted:');
      users.forEach((u, i) => console.log(`  ${i + 1}. ${u.email} (${u.firstName} ${u.lastName}) - ${u.role}`));
    }

    if (command === '--confirm-delete-all') {
      console.log('\n🗑️  Deleting all users...');
      const result = await User.deleteMany({});
      console.log(`✅ Deleted ${result.deletedCount} users`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

main();
