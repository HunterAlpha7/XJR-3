const mongoose = require('mongoose');

const ReadSchema = new mongoose.Schema({
  user: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  notes: { type: String, required: true },
});

const PaperSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  metadata: {
    title: { type: String, required: true },
    authors: [{ type: String }],
    abstract: { type: String, required: true },
    publishYear: {
      type: Number,
      required: true,
      min: [1900, 'Publish year must be after 1900'],
      validate: {
        validator: Number.isInteger,
        message: 'Publish year must be an integer',
      },
    },
  },
  reads: [ReadSchema],
});

// Indexes
PaperSchema.index({ id: 1 });
PaperSchema.index({ 'metadata.publishYear': 1 });
PaperSchema.index({ 'reads.user': 1 });

const Paper = mongoose.model('Paper', PaperSchema);

module.exports = Paper;
