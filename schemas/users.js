const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  Username: {
    type: String,
    required: true, 
    unique: true
    },
    avatar: {
    type: String,
    default: "✈️"
    },

    Hash: {
    type: String,
    required: true
    },
    Salt: {
    type: String,
    required: true
        },

    Email: {
    type: String,
    required: true,
    unique: true
    },
    DiscordID: {
    type: String,
    unique: true,
    default:""

    },

    Flighthours: {
    type: Number,
    required: true,
    default: 0
    },
    Role:{
        type: [String],
        enum: ['admin', 'atc', 'enforcer','user',"mod","owner"],
        default: ['user'],
        required: true
    },
    Callsign: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    default: "None"
    },
    code: {
    type: String,
    default: function() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    },
    unique: true
    }
});
module.exports = mongoose.model('Users', schema);