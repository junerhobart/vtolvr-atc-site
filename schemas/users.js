const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  Username: {
    type: String,
    required: true, 
    unique: true
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
    }
});
module.exports = mongoose.model('Users', schema);