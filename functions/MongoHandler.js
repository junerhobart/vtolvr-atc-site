const mongoose = require('mongoose');
// env variables
require('dotenv').config();

async function Mongo(){


    

mongoose.connect(process.env.MONGODB_URI, {
}).then(() => {
    return console.log('Connected to MongoDB');
}).catch((err) => {
    return console.log('Error connecting to MongoDB:', err);
});}

module.exports = Mongo;