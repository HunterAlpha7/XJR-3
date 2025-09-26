const express = require('express');
const Joi = require('joi');
const Admin = require('../models/admin');
const { generateAdminToken, verifyAdminToken } = require('../../shared/auth');
const User = require('../models/user'); // Import User model
const winston = require('winston'); // Import winston for logging
const Paper = require('../models/paper'); // Import Paper model
const Config = require('../models/config'); // Import Config model

const router = express.Router();

// Configure Winston logger (re-using configuration from server.js for consistency)
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

// Joi schema for validating admin login credentials
const loginSchema = Joi.object({
  adminUsername: Joi.string().required(),
  password: Joi.string().required(),
});

// Middleware for admin JWT authentication
const authenticateAdmin = (req, res, next) => {
  const token = req.header('x-auth-token');
  if (!token) {
    return res.status(401).json({ message: 'No token, authorization denied' });
  }
  try {
    const decoded = verifyAdminToken(token);
    if (!decoded || !decoded.admin) {
      return res.status(401).json({ message: 'Token is not valid or not an admin token' });
    }
    req.admin = decoded.admin;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};

// Joi schema for creating a new user
const createUserSchema = Joi.object({
  username: Joi.string().required().trim().lowercase(),
  password: Joi.string().min(6).required(),
});

// POST /api/admin/login
router.post('/login', async (req, res) => {
  const { error, value } = loginSchema.validate(req.body);

  if (error) {
    return res.status(400).json({ message: error.details[0].message });
  }

  const { adminUsername, password } = value;

  try {
    const admin = await Admin.findOne({ adminUsername });
    if (!admin) {
      return res.status(400).json({ message: 'Invalid Credentials' });
    }

    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid Credentials' });
    }

    // Update last access time
    admin.lastAccess = new Date();
    await admin.save();

    const payload = { admin: { id: admin._id } };
    const token = generateAdminToken(payload);

    res.status(200).json({ message: 'Admin logged in successfully', token });
  } catch (error) {
    console.error('Error during admin login:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/admin/users
router.get('/users', authenticateAdmin, async (req, res) => {
  try {
    const users = await User.find({}).select('-passwordHash'); // Exclude password hashes
    res.status(200).json(users);
  } catch (error) {
    logger.error('Error fetching users:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/admin/users - Create a new user
router.post('/users', authenticateAdmin, async (req, res) => {
  const { error, value } = createUserSchema.validate(req.body);

  if (error) {
    return res.status(400).json({ message: error.details[0].message });
  }

  const { username, password } = value;

  try {
    let user = await User.findOne({ username });
    if (user) {
      return res.status(409).json({ message: 'User with that username already exists' });
    }

    user = new User({
      username,
      passwordHash: password, // passwordHash will be hashed by pre-save hook
    });
    await user.save();

    logger.info(`Admin ${req.admin.id} created new user: ${username}`);
    res.status(201).json({ message: 'User created successfully', user: { id: user._id, username: user.username } });
  } catch (error) {
    logger.error('Error creating user:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/admin/users/:id - Delete a user
router.delete('/users/:id', authenticateAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const user = await User.findByIdAndDelete(id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    logger.info(`Admin ${req.admin.id} deleted user: ${user.username} (ID: ${user._id})`);
    res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    logger.error('Error deleting user:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Joi schema for deleting a read entry by admin
const deleteReadSchema = Joi.object({
  paperId: Joi.string().required(),
  readEntryId: Joi.string().required(),
});

// DELETE /api/admin/mark-read - Admin removes a read entry for any user
router.delete('/mark-read', authenticateAdmin, async (req, res) => {
  const { error, value } = deleteReadSchema.validate(req.body);

  if (error) {
    return res.status(400).json({ message: error.details[0].message });
  }

  const { paperId, readEntryId } = value;

  try {
    const paper = await Paper.findOneAndUpdate(
      { id: paperId, 'reads._id': readEntryId },
      { $pull: { reads: { _id: readEntryId } } },
      { new: true }
    ).select('-__v');

    if (!paper) {
      return res.status(404).json({ message: 'Paper or read entry not found.' });
    }

    logger.info(`Admin ${req.admin.id} removed read entry ${readEntryId} from paper ${paperId}.`);
    res.status(200).json({ message: 'Read entry removed successfully by admin', paper });
  } catch (error) {
    logger.error('Error deleting read entry by admin:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Joi schema for validating config update
const configUpdateSchema = Joi.object({
  preventDuplicateReads: Joi.boolean().required(),
});

// GET /api/admin/config - Retrieve current configuration
router.get('/config', authenticateAdmin, async (req, res) => {
  try {
    const config = await Config.findOne({});
    res.status(200).json({ preventDuplicateReads: config ? config.preventDuplicateReads : false });
  } catch (error) {
    logger.error('Error retrieving config:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/admin/config - Update configuration
router.post('/config', authenticateAdmin, async (req, res) => {
  const { error, value } = configUpdateSchema.validate(req.body);

  if (error) {
    return res.status(400).json({ message: error.details[0].message });
  }

  const { preventDuplicateReads } = value;

  try {
    const config = await Config.findOneAndUpdate(
      {},
      { preventDuplicateReads },
      { new: true, upsert: true }
    );
    logger.info(`Admin ${req.admin.id} updated config: preventDuplicateReads to ${preventDuplicateReads}`);
    res.status(200).json({ message: 'Config updated successfully', preventDuplicateReads: config.preventDuplicateReads });
  } catch (error) {
    logger.error('Error updating config:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
