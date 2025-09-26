const mongoose = require('mongoose');
const { hashPassword, comparePassword } = require('../../shared/auth'); // Import from shared utils

const AdminSchema = new mongoose.Schema({
  adminUsername: {
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
  lastAccess: {
    type: Date,
    default: Date.now,
  },
});

// Pre-save hook to hash password before saving
AdminSchema.pre('save', async function (next) {
  if (this.isModified('passwordHash')) {
    this.passwordHash = await hashPassword(this.passwordHash);
  }
  next();
});

// Method to compare password (optional, could be done directly with shared/auth.js)
AdminSchema.methods.comparePassword = async function (candidatePassword) {
  return await comparePassword(candidatePassword, this.passwordHash);
};

const Admin = mongoose.model('Admin', AdminSchema);

module.exports = Admin;
