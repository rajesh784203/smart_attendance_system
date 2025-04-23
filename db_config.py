from pymongo import MongoClient
from datetime import datetime
import pytz
import os

# MongoDB connection string
MONGODB_URI = "mongodb+srv://gurajalarajesh10:rajeshmongodb9876@cluster0.xqaxznh.mongodb.net/"
DATABASE_NAME = "face_login_db"

# Initialize MongoDB client
try:
    client = MongoClient(MONGODB_URI)
    # Test the connection
    client.server_info()
    print("Successfully connected to MongoDB!")
except Exception as e:
    print(f"Failed to connect to MongoDB: {str(e)}")
    raise

db = client[DATABASE_NAME]

# Collections
teachers_collection = db["teachers"]
students_collection = db["students"]
rooms_collection = db["rooms"]

# Set timezone to IST
ist = pytz.timezone('Asia/Kolkata')

def get_current_time():
    return datetime.now(ist).isoformat() 