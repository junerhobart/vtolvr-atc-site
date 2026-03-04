const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  timezone: {
    type: String,
    required: true,
    trim: true,
  },
  airport: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
  },
  pilots: {
    type: Number,
    required: true,
    min: 0,
  },
  duration: {
    type: String,
    required: true,
    trim: true,
  },
  status: {
    type: String,
    enum: ['active', 'upcoming', 'completed', 'cancelled'],
    default: 'upcoming',
    lowercase: true,
  },
  startTime: {
    type: Date,
    required: true,
  },
  endTime: {
    type: Date,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
    description: {
    type: String,
    trim: true,
  },
});

module.exports = mongoose.model('Event', eventSchema);
