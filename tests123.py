from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os
import random
import string
from deepface import DeepFace
import logging
from werkzeug.utils import secure_filename
import json
from db_config import (
    teachers_collection, 
    students_collection,
    get_current_time
)
import base64
from io import BytesIO
from PIL import Image
import numpy as np
import cv2

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Get the absolute path to the static folder
STATIC_FOLDER = os.path.abspath(os.path.join(os.path.dirname(__file__), 'public'))

app = Flask(__name__, static_folder=STATIC_FOLDER)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size
app.config['SECRET_KEY'] = 'your-secret-key-here'  # Required for session management
app.config['SESSION_COOKIE_SECURE'] = False  # Allow non-HTTPS cookies
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'  # Allow cross-site cookies
app.config['PERMANENT_SESSION_LIFETIME'] = 3600  # 1 hour session lifetime

# Configure CORS with more permissive settings
CORS(app, resources={
    r"/*": {
        "origins": "*",
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization", "X-Requested-With"],
        "supports_credentials": True,
        "expose_headers": ["Content-Type", "Authorization"],
        "max_age": 3600
    }
})

# Add security headers
@app.after_request
def add_security_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With'
    response.headers['Access-Control-Allow-Credentials'] = 'true'
    response.headers['Access-Control-Max-Age'] = '3600'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'SAMEORIGIN'
    return response

def base64_to_image(base64_string):
    try:
        # Remove the data URL prefix if present
        if ',' in base64_string:
            base64_string = base64_string.split(',')[1]
        
        # Decode base64 string to binary
        image_data = base64.b64decode(base64_string)
        
        # Convert binary to PIL Image
        image = Image.open(BytesIO(image_data))
        return image
    except Exception as e:
        logger.error(f"Failed to convert base64 to image: {str(e)}")
        raise

def image_to_numpy(image):
    try:
        # Convert PIL Image to numpy array
        return np.array(image)
    except Exception as e:
        logger.error(f"Failed to convert image to numpy array: {str(e)}")
        raise

def recognize_face(image_data, user_type):
    try:
        # Convert image data to PIL Image
        image = Image.open(BytesIO(image_data))
        image_np = image_to_numpy(image)
        
        # Select the appropriate collection based on user type
        collection = teachers_collection if user_type == "teacher" else students_collection
        users = collection.find({})
        
        for user in users:
            face_image_binary = user.get("face_image")
            if face_image_binary:
                try:
                    # Convert stored binary to PIL Image
                    stored_image = Image.open(BytesIO(face_image_binary))
                    stored_image_np = image_to_numpy(stored_image)
                    
                    # Use DeepFace for verification
                    result = DeepFace.verify(
                        image_np,
                        stored_image_np,
                        model_name="Facenet",
                        enforce_detection=False
                    )
                    
                    if result["verified"]:
                        return user["username"]
                except Exception as e:
                    logger.warning(f"Face verification failed for user {user.get('username')}: {str(e)}")
                    continue
        return None
    except Exception as e:
        logger.error(f"Failed to recognize face: {str(e)}")
        raise

@app.route("/")
def serve_index_page():
    try:
        return send_from_directory(STATIC_FOLDER, "STARTER.html")
    except Exception as e:
        logger.error(f"Failed to serve index page: {str(e)}")
        return jsonify({"error": "Internal server error"}), 500

@app.route("/teacher")
def serve_teacher_page():
    try:
        return send_from_directory(STATIC_FOLDER, "teacher.html")
    except Exception as e:
        logger.error(f"Failed to serve teacher page: {str(e)}")
        return jsonify({"error": "Internal server error"}), 500

@app.route("/student")
def serve_student_page():
    try:
        return send_from_directory(STATIC_FOLDER, "student.html")
    except Exception as e:
        logger.error(f"Failed to serve student page: {str(e)}")
        return jsonify({"error": "Internal server error"}), 500

@app.route("/register")
def serve_register_page():
    try:
        return send_from_directory(STATIC_FOLDER, "register.html")
    except Exception as e:
        logger.error(f"Failed to serve register page: {str(e)}")
        return jsonify({"error": "Internal server error"}), 500

@app.route("/register", methods=["POST"])
def register_user():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No data provided"}), 400
            
        # Check each field individually
        missing_fields = []
        if not data.get("username"):
            missing_fields.append("username")
        if not data.get("face_image_path"):
            missing_fields.append("face image")
        if not data.get("user_type"):
            missing_fields.append("user type")
        
        if missing_fields:
            return jsonify({
                "error": f"Missing required fields: {', '.join(missing_fields)}"
            }), 400
            
        username = data.get("username")
        face_image_base64 = data.get("face_image_path")
        user_type = data.get("user_type")
            
        if user_type not in ["teacher", "student"]:
            return jsonify({"error": "Invalid user type. Must be 'teacher' or 'student'"}), 400
        
        # Validate username contains only numbers
        if not username.isdigit():
            return jsonify({"error": "Username must contain only numbers"}), 400
        
        # Check if username already exists in either collection
        teacher_exists = teachers_collection.find_one({"username": username})
        student_exists = students_collection.find_one({"username": username})
        
        if teacher_exists or student_exists:
            return jsonify({"error": "Username already exists"}), 400

        # Convert base64 to binary
        face_image_binary = base64.b64decode(face_image_base64.split(',')[1] if ',' in face_image_base64 else face_image_base64)
        
        # Convert to PIL Image for verification
        image = Image.open(BytesIO(face_image_binary))
        image_np = image_to_numpy(image)

        # Check if face already exists in either collection
        try:
            # Check teachers collection
            teachers = teachers_collection.find({})
            for teacher in teachers:
                if teacher.get("face_image"):
                    try:
                        stored_image = Image.open(BytesIO(teacher["face_image"]))
                        stored_image_np = image_to_numpy(stored_image)
                        result = DeepFace.verify(
                            image_np,
                            stored_image_np,
                            model_name="Facenet",
                            enforce_detection=False
                        )
                        
                        if result["verified"]:
                            return jsonify({
                                "error": f"This face is already registered under username: {teacher['username']}"
                            }), 400
                    except Exception as e:
                        logger.warning(f"Face verification failed during registration check: {str(e)}")
                        continue

            # Check students collection
            students = students_collection.find({})
            for student in students:
                if student.get("face_image"):
                    try:
                        stored_image = Image.open(BytesIO(student["face_image"]))
                        stored_image_np = image_to_numpy(stored_image)
                        result = DeepFace.verify(
                            image_np,
                            stored_image_np,
                            model_name="Facenet",
                            enforce_detection=False
                        )
                        
                        if result["verified"]:
                            return jsonify({
                                "error": f"This face is already registered under username: {student['username']}"
                            }), 400
                    except Exception as e:
                        logger.warning(f"Face verification failed during registration check: {str(e)}")
                        continue

        except Exception as e:
            logger.error(f"Error checking for existing face: {str(e)}")
            return jsonify({"error": "Failed to verify face uniqueness"}), 500
        
        # If we get here, the face is unique. Add user to appropriate collection
        collection = teachers_collection if user_type == "teacher" else students_collection
        collection.insert_one({
            "username": username,
            "face_image": face_image_binary,  # Store binary image data
            "user_type": user_type,
            "created_at": get_current_time()
        })
        
        return jsonify({"message": f"{user_type.capitalize()} registered successfully"})
    except Exception as e:
        logger.error(f"Failed to register user: {str(e)}")
        return jsonify({"error": "Internal server error"}), 500

@app.route("/recognize", methods=["POST"])
def recognize_user():
    try:
        if "file" not in request.files:
            return jsonify({"error": "No file provided"}), 400
            
        user_type = request.form.get("user_type")
        if not user_type or user_type not in ["teacher", "student"]:
            return jsonify({"error": "Invalid or missing user type"}), 400
        
        file = request.files["file"]
        if not file.filename:
            return jsonify({"error": "No file selected"}), 400
            
        if not file.filename.lower().endswith(('.png', '.jpg', '.jpeg')):
            return jsonify({"error": "Invalid file type"}), 400
            
        image_data = file.read()
        username = recognize_face(image_data, user_type)
        
        logger.info(f"Face recognition result for {user_type}: {username}")  # Debug log
        
        if username:
            response_data = {
                "success": True,
                "message": f"Welcome back, {username}!",
                "username": username,
                "user_type": user_type
            }
            logger.info(f"Sending response: {response_data}")  # Debug log
            return jsonify(response_data)
        else:
            return jsonify({"message": "Face not recognized"}), 400
    except Exception as e:
        logger.error(f"Failed to recognize user: {str(e)}")
        return jsonify({"error": "Internal server error"}), 500

if __name__ == "__main__":
    # Ensure static folder exists
    if not os.path.exists(STATIC_FOLDER):
        os.makedirs(STATIC_FOLDER)
    
    # Get port from environment variable or use default
    port = int(os.environ.get('PORT', 5000))
    
    # Run with specific host and port
    app.run(
        host='0.0.0.0',  # Allow external connections
        port=port,
        debug=False  # Disable debug mode in production
    )
