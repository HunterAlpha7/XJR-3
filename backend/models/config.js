const mongoose = require('mongoose');

const ConfigSchema = new mongoose.Schema({
  preventDuplicateReads: {
    type: Boolean,
    default: false,
  },
}, { timestamps: true });

const Config = mongoose.model('Config', ConfigSchema);

module.exports = Config;
