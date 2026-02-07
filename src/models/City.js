const mongoose = require('mongoose');

const citySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    unique: true,
  },
  state: {
    type: String,
    trim: true,
    default: '',
  },
  pincodePrefix: [{
    type: String,
    required: true,
  }],
  isActive: {
    type: Boolean,
    default: false,
  },
  launchDate: {
    type: String,
    default: '', // e.g. "Q3 2025"
  },
  // Granular service availability
  services: {
    findNanny: { type: Boolean, default: false },
    daycare: { type: Boolean, default: false },
    elderCare: { type: Boolean, default: false },
    hourlyCare: { type: Boolean, default: false },
    nightCare: { type: Boolean, default: false },
    fullDayCare: { type: Boolean, default: false },
    emergencyCare: { type: Boolean, default: false },
    support: { type: Boolean, default: true },
  },
  // Display order for upcoming cities list
  sortOrder: {
    type: Number,
    default: 0,
  },
}, { timestamps: true });

// Index on pincodePrefix for fast lookups
citySchema.index({ pincodePrefix: 1 });
citySchema.index({ isActive: 1 });

const City = mongoose.model('City', citySchema);

module.exports = City;
