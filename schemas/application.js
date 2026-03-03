const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  date: {
    type: Date,
    default: Date.now
  },
  type: {
    type: String,
    enum: ['ATC', 'Enforcer'],
    required: true
  },
  callsign: {
    type: String,
    required: function() { return this.type === 'ATC'; }
  },
  discordHandle: {
    type: String,
    required: function() { return this.type === 'Enforcer'; }
  }
});
module.exports = mongoose.model('application', schema);