IMPLEMENTATION:
This project aims to automate student attendance using face recognition. It also enables
teachers to create rooms (classes), and students can join those rooms only after a successful
face match. It’s a web-based system combining frontend (HTML, JS, Bootstrap) and backend
(Python Flask, express js ), MongoDB.
1. Teacher Module
- Login/Register using Face Recognition
 Teachers first register themselves by entering a numeric username and capturing a live
image using their webcam. This face data is stored in MongoDB

- Create Room
 After authentication, the teacher can create a new room. A unique room ID is attached to it.
- View Students in Room
 Teachers can see a list of students who join the room without any latency with help of
webRTC.
- Generate Attendance History
 Teachers can see the list of joined students previously by giving that respective date as
input.
2. Student Module
- Register with Face & Username
 Students also register by entering an 11-digit unique username and capturing their live face
image.
- Face Authentication to Join Room
 When a student tries to join a room, their face is verified using the stored face data. Only if
it matches, they are redirected to further interface of his account.



- Mark Attendance Automatically
 Upon successful room joining, the system marks the student's attendance under that room.
3. Backend Flow (Flask + Express js):
- Image Capture via Webcam:
 JavaScript captures an image in Base64 format and sends it to Flask.
- Face Comparison Logic:
 Flask uses face recognition libraries (like face_recognition) to compare live image with
saved encoded faces.
- Database Operations:
 - Face encodings, usernames, room data, and attendance are saved in Mongodb.
 - Each room has a list of joined students.
- Attendance History:
 Teacher can see students joined in his class at a particular date,
 and similarly students can also fetch their attendance history
Flowchart Summary
Student → Capture Face → Face Recognition → Join Room → Mark Attendance*
Key Technologies Used:
- Frontend: HTML, Bootstrap, JavaScript
- Backend: Flask (Python)
- Database: MongoDB
- Face Detection: opencv
- PDF/Image Export: Python libraries (like imgkit, reportlab, or PIL)


Overall Flow of web site:

- A fully working web app where:
 - Teachers manage class attendance.
 - Students securely authenticate via face.
 - Attendance is contactless and automated.
 - Room-wise attendance records are maintained.
