const express = require('express');
const cors = require('cors');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: {
        origin: 'http://localhost:5000',
        methods: ['GET', 'POST']
    }
});
const path = require('path');
const mongoose = require('mongoose');
const crypto = require('crypto');
const Room = require('./models/Room');

app.use(cors({
    origin: 'http://localhost:5000',
    methods: ['GET', 'POST'],
    credentials: true
}));

// MongoDB Connection
mongoose.connect('mongodb+srv://gurajalarajesh10:rajeshmongodb9876@cluster0.xqaxznh.mongodb.net/room_management')
    .then(() => console.log('Connected to MongoDB - Database: room_management'))
    .catch(err => console.error('MongoDB connection error:', err));

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Store room data
const rooms = new Map();

// Function to get current time in UTC
function getISTTime() {
    return new Date().toISOString();
}

// Generate random room code
function generateRoomCode() {
    return crypto.randomBytes(3).toString('hex').toUpperCase();
}

// Helper function to calculate distance between two points
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // Distance in meters
}

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join-room', (data) => {
        const { roomid, emailid, isTeacher, teacherName, latitude, longitude } = data;
        
        if (!roomid || !emailid) {
            socket.emit('join-error', { message: 'Room ID and Email ID are required' });
            return;
        }

        // Join the socket to the room
        socket.join(roomid);

        // Initialize room if it doesn't exist
        if (!rooms.has(roomid)) {
            rooms.set(roomid, {
                users: new Map(), // Changed from Set to Map to store additional user info
                teacher: isTeacher ? emailid : null,
                teacherName: teacherName || null,
                teacherLocation: isTeacher ? { latitude, longitude } : null
            });
        }

        // For students, check distance from teacher if not manually added
        if (!isTeacher && !data.isManualEntry) {
            const room = rooms.get(roomid);
            if (room.teacherLocation) {
                const distance = calculateDistance(
                    latitude, 
                    longitude, 
                    room.teacherLocation.latitude, 
                    room.teacherLocation.longitude
                );
                
                // If distance is more than 10 meters, reject the join
                if (distance > 5) {
                    socket.emit('join-error', { 
                        message: 'You are too far from the teacher. Maximum allowed distance is 10 meters.' 
                    });
                    return;
                }
            }
        }

        // Add user to room with additional info
        rooms.get(roomid).users.set(emailid, {
            email: emailid,
            name: data.name || emailid,
            joinTime: getISTTime(),
            isManualEntry: data.isManualEntry || false,
            location: { latitude, longitude }
        });

        // If this is a teacher, update teacher location
        if (isTeacher) {
            rooms.get(roomid).teacherLocation = { latitude, longitude };
        }

        // Notify the joining user
        socket.emit('joined-room', {
            roomid,
            users: Array.from(rooms.get(roomid).users.values()),
            isTeacher: isTeacher
        });

        // Notify others in the room
        socket.to(roomid).emit('user-joined', { 
            emailid,
            name: data.name || emailid,
            joinTime: getISTTime(),
            isManualEntry: data.isManualEntry || false
        });
        io.to(roomid).emit('room-users-updated', {
            users: Array.from(rooms.get(roomid).users.values())
        });
    });

    // Add new socket event for manual student addition
    socket.on('add-manual-student', (data) => {
        const { roomid, studentEmail } = data;
        const room = rooms.get(roomid);
        
        if (!room) {
            socket.emit('add-student-error', { message: 'Room not found' });
            return;
        }

        // Check if user is teacher by comparing with room's teacher email
        const teacherEmail = `teacher_${room.teacherName}`;
        if (room.users.get(teacherEmail)?.email !== teacherEmail) {
            socket.emit('add-student-error', { message: 'Only teacher can add students manually' });
            return;
        }

        // Add student to room
        room.users.set(studentEmail, {
            email: studentEmail,
            name: studentEmail,
            joinTime: getISTTime(),
            isManualEntry: true,
            location: null // Manual entries don't need location
        });

        // Notify all users in the room
        io.to(roomid).emit('user-joined', {
            emailid: studentEmail,
            name: studentEmail,
            joinTime: getISTTime(),
            isManualEntry: true
        });
        
        io.to(roomid).emit('room-users-updated', {
            users: Array.from(room.users.values())
        });
    });

    // Add new socket event for updating teacher location
    socket.on('update-teacher-location', (data) => {
        const { roomid, latitude, longitude } = data;
        const room = rooms.get(roomid);
        
        if (!room) {
            socket.emit('location-update-error', { message: 'Room not found' });
            return;
        }

        // Check if user is teacher
        if (room.teacher !== socket.id) {
            socket.emit('location-update-error', { message: 'Only teacher can update location' });
            return;
        }

        // Update teacher location
        room.teacherLocation = { latitude, longitude };
        
        // Update teacher's location in users map
        const teacherUser = room.users.get(room.teacher);
        if (teacherUser) {
            teacherUser.location = { latitude, longitude };
            room.users.set(room.teacher, teacherUser);
        }

        // Notify all users about the location update
        io.to(roomid).emit('room-users-updated', {
            users: Array.from(room.users.values())
        });
    });

    socket.on('save-room-data', async (data) => {
        const { roomid, teacherName } = data;
        const room = rooms.get(roomid);
        
        if (!room) {
            socket.emit('save-error', { message: 'Room not found' });
            return;
        }

        try {
            const currentTime = new Date();
            const existingRoom = await Room.findOne({ roomId: roomid });
            
            if (existingRoom) {
                existingRoom.teacherName = teacherName;
                existingRoom.date = currentTime;
                existingRoom.users = Array.from(room.users.values()).map(user => ({
                    email: user.email,
                    name: user.name || user.email,
                    joinTime: user.joinTime,
                    isManualEntry: user.isManualEntry
                }));
                await existingRoom.save();
            } else {
                const roomData = new Room({
                    teacherName: teacherName,
                    roomId: roomid,
                    date: currentTime,
                    users: Array.from(room.users.values()).map(user => ({
                        email: user.email,
                        name: user.name || user.email,
                        joinTime: user.joinTime,
                        isManualEntry: user.isManualEntry
                    }))
                });
                await roomData.save();
            }
            
            socket.emit('save-success', { message: 'Room data saved successfully' });
        } catch (error) {
            console.error('Error saving room data:', error);
            socket.emit('save-error', { message: 'Error saving room data: ' + error.message });
        }
    });

    socket.on('disconnect', () => {
        // Find and remove the user from their room
        for (const [roomId, roomData] of rooms.entries()) {
            if (socket.rooms.has(roomId)) {
                const userEmail = Array.from(roomData.users).find(email => 
                    socket.rooms.has(roomId) && socket.rooms.has(email)
                );
                if (userEmail) {
                    roomData.users.delete(userEmail);
                    io.to(roomId).emit('user-left', { emailid: userEmail });
                    io.to(roomId).emit('room-users-updated', {
                        users: Array.from(roomData.users)
                    });
                }
            }
        }
    });

    socket.on('call-user',data =>{
        const {emailid, offer} = data;
        const fromEmail = Array.from(rooms.get(emailid) || new Set()).find(e => e === emailid);
        const socketId = Array.from(rooms.get(emailid) || new Set()).find(s => s !== emailid);
        if (socketId) {
            socket.to(socketId).emit('incoming-call',{from: fromEmail, offer})
        }
    });

    socket.on('call-accepted',data =>{
        const {emailid, answer} = data;
        const socketId = Array.from(rooms.get(emailid) || new Set()).find(s => s !== emailid);
        if (socketId) {
            socket.to(socketId).emit('call-accepted',{answer});
        }
    })
});

// API Routes
app.post('/api/generate-room', (req, res) => {
    const roomCode = generateRoomCode();
    res.json({ roomCode });
});

// New endpoint to fetch room history
app.get('/api/room-history', async (req, res) => {
    try {
        const { date, teacherName } = req.query;
        if (!date || !teacherName) {
            return res.status(400).json({ error: 'Date and teacher name parameters are required' });
        }

        // Convert date string to Date object (assuming date is in YYYY-MM-DD format)
        const startDate = new Date(date);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(date);
        endDate.setHours(23, 59, 59, 999);

        const rooms = await Room.find({
            date: {
                $gte: startDate,
                $lte: endDate
            },
            teacherName: teacherName
        }).sort({ date: -1 });

        // Filter out teacher from users list
        const filteredRooms = rooms.map(room => ({
            ...room.toObject(),
            users: room.users.filter(user => !user.email.startsWith('teacher_'))
        }));

        res.json(filteredRooms);
    } catch (error) {
        console.error('Error fetching room history:', error);
        res.status(500).json({ error: 'Error fetching room history' });
    }
});

// New endpoint for student room history
app.get('/api/student-room-history', async (req, res) => {
    try {
        const { date, studentEmail } = req.query;
        if (!date || !studentEmail) {
            return res.status(400).json({ error: 'Date and student email parameters are required' });
        }

        // Convert date string to Date object
        const startDate = new Date(date);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(date);
        endDate.setHours(23, 59, 59, 999);

        const rooms = await Room.find({
            date: {
                $gte: startDate,
                $lte: endDate
            },
            'users.email': studentEmail
        }).sort({ date: -1 });

        // Format the response to only include relevant information
        const formattedRooms = rooms.map(room => {
            const joinTime = room.users.find(user => user.email === studentEmail).joinTime;
            
            return {
                roomId: room.roomId,
                teacherName: room.teacherName,
                joinTime: joinTime
            };
        });

        res.json(formattedRooms);
    } catch (error) {
        console.error('Error fetching student room history:', error);
        res.status(500).json({ error: 'Error fetching student room history' });
    }
});


const port = process.env.PORT || 3000;
http.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
