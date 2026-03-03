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
    enum: ['atc', 'enforcer'],
    required: true
  },
  callsign: {
    type: String,
    required: function() { return this.type === 'atc'; }
  },
  discordHandle: {
    type: String,
    required: function() { return this.type === 'enforcer'; }
  },
  discordId: {
    type: String,
    required: true
  },
  experience: {
    type: String,
   
  },
  whyJoin: {
    type: String,
    
  }
  

});
module.exports = mongoose.model('application', schema);