const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
    teacherName: {
        type: String,
        required: true
    },
    date: {
        type: Date,
        default: Date.now
    },
    roomId: {
        type: String,
        required: true,
        unique: true
    },
    users: [{
        email: String,
        name: String,
        joinTime: {
            type: Date,
            default: Date.now
        },
        isManualEntry: {
            type: Boolean,
            default: false
        },
        location: {
            latitude: Number,
            longitude: Number
        }
    }]
});

module.exports = mongoose.model('Room', roomSchema); 