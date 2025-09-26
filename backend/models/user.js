const mongoose = require('mongoose');
const { hashPassword, comparePassword } = require('../../shared/auth'); // Import from shared utils

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  passwordHash: {
    type: String,
    required: true,
  },
});

// Pre-save hook to hash password before saving
UserSchema.pre('save', async function (next) {
  if (this.isModified('passwordHash')) {
    this.passwordHash = await hashPassword(this.passwordHash);
  }
  next();
});

// Method to compare password (optional, could be done directly with shared/auth.js)
UserSchema.methods.comparePassword = async function (candidatePassword) {
  return await comparePassword(candidatePassword, this.passwordHash);
};

const User = mongoose.model('User', UserSchema);

module.exports = User;
