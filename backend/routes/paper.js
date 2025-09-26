const express = require('express');
const Joi = require('joi');
const Paper = require('../models/paper');
const { verifyUserToken } = require('../../shared/auth');
const config = require('../../shared/config');

const router = express.Router();

// Joi schema for validating paper metadata
const metadataSchema = Joi.object({
  title: Joi.string().required(),
  authors: Joi.array().items(Joi.string()).required(),
  abstract: Joi.string().required(),
  publishYear: Joi.number().integer().min(1900).required(),
});

// Joi schema for validating the read entry
const readSchema = Joi.object({
  user: Joi.string().required(),
  notes: Joi.string().required(),
});

// Middleware for user JWT authentication
const authenticateUser = (req, res, next) => {
  const token = req.header('x-auth-token');
  if (!token) {
    return res.status(401).json({ message: 'No token, authorization denied' });
  }
  try {
    const decoded = verifyUserToken(token);
    if (!decoded) {
      return res.status(401).json({ message: 'Token is not valid' });
    }
    req.user = decoded.user;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};

// POST /api/papers/mark-read
router.post('/mark-read', authenticateUser, async (req, res) => {
  const { id, metadata, read } = req.body;

  // Validate input
  const { error: metadataError } = metadataSchema.validate(metadata);
  const { error: readError } = readSchema.validate(read);

  if (metadataError || readError) {
    return res.status(400).json({ message: metadataError?.details[0].message || readError?.details[0].message });
  }

  try {
    const newReadEntry = { user: req.user.id, timestamp: new Date(), notes: read.notes };

    let paper = await Paper.findOne({ id });

    if (paper) {
      // Check for duplicate reads if configured
      if (config.preventDuplicateReads) {
        const isDuplicate = paper.reads.some(
          (existingRead) => existingRead.user === newReadEntry.user && existingRead.notes === newReadEntry.notes
        );
        if (isDuplicate) {
          return res.status(409).json({ message: 'Duplicate read entry prevented.' });
        }
      }
      paper.reads.push(newReadEntry);
      await paper.save();
    } else {
      // Create new paper if it doesn't exist
      paper = new Paper({
        id,
        metadata,
        reads: [newReadEntry],
      });
      await paper.save();
    }

    res.status(200).json({ message: 'Paper marked as read successfully', paper });
  } catch (error) {
    console.error('Error marking paper as read:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/papers/check-paper
router.get('/check-paper', authenticateUser, async (req, res) => {
  const schema = Joi.object({
    id: Joi.string().required(),
    details: Joi.boolean().optional(),
  });

  const { error, value } = schema.validate(req.query);

  if (error) {
    return res.status(400).json({ message: error.details[0].message });
  }

  const { id, details } = value;

  try {
    const paper = await Paper.findOne({ id });

    if (!paper) {
      return res.status(404).json({ message: 'Paper not found' });
    }

    // Determine read status for the current user
    const readByUser = paper.reads.some(read => read.user === req.user.id);

    const response = {
      id: paper.id,
      readStatus: readByUser ? 'read' : 'unread',
      metadata: paper.metadata,
    };

    if (details) {
      response.reads = paper.reads;
    }

    res.status(200).json(response);
  } catch (error) {
    console.error('Error checking paper:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/papers/search-papers
router.get('/search-papers', authenticateUser, async (req, res) => {
  const schema = Joi.object({
    keyword: Joi.string().trim().optional(),
    user: Joi.string().trim().optional(),
    publishYear: Joi.number().integer().min(1900).optional(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(50).default(10),
  });

  const { error, value } = schema.validate(req.query);

  if (error) {
    return res.status(400).json({ message: error.details[0].message });
  }

  const { keyword, user, publishYear, page, limit } = value;

  try {
    const pipeline = [];

    const matchConditions = {};
    if (keyword) {
      const searchRegex = new RegExp(keyword, 'i');
      matchConditions.$or = [
        { 'metadata.title': searchRegex },
        { 'metadata.authors': searchRegex },
        { 'metadata.abstract': searchRegex },
      ];
    }
    if (user) {
      matchConditions['reads.user'] = user;
    }
    if (publishYear) {
      matchConditions['metadata.publishYear'] = publishYear;
    }

    if (Object.keys(matchConditions).length > 0) {
      pipeline.push({ $match: matchConditions });
    }

    // Project to ensure UTC timestamps (they are stored as UTC by Mongoose Date type by default)
    pipeline.push({
      $project: {
        _id: 0,
        id: 1,
        metadata: 1,
        reads: 1,
      },
    });

    // Pagination using $facet
    pipeline.push({
      $facet: {
        metadata: [{ $count: 'totalCount' }],
        data: [{
          $skip: (page - 1) * limit
        }, { $limit: limit }],
      },
    });

    const result = await Paper.aggregate(pipeline);

    const papers = result[0].data;
    const totalCount = result[0].metadata[0] ? result[0].metadata[0].totalCount : 0;

    res.status(200).json({
      totalCount,
      page,
      limit,
      papers,
    });
  } catch (error) {
    console.error('Error searching papers:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/papers/mark-read
router.delete('/mark-read', authenticateUser, async (req, res) => {
  const schema = Joi.object({
    id: Joi.string().required(),
    readEntryId: Joi.string().required(), // Assuming read entries will have an _id from Mongoose
  });

  const { error, value } = schema.validate(req.body);

  if (error) {
    return res.status(400).json({ message: error.details[0].message });
  }

  const { id, readEntryId } = value;
  const userId = req.user.id; // User ID from authenticated JWT

  try {
    const paper = await Paper.findOneAndUpdate(
      { id: id, 'reads._id': readEntryId, 'reads.user': userId },
      { $pull: { reads: { _id: readEntryId, user: userId } } },
      { new: true }
    ).select('-__v');

    if (!paper) {
      return res.status(404).json({ message: 'Paper or read entry not found for this user.' });
    }

    res.status(200).json({ message: 'Read entry removed successfully', paper });
  } catch (error) {
    console.error('Error deleting read entry:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
