import os
from pymongo import MongoClient
from dotenv import load_dotenv
import certifi

def check_user():
    env_path = os.path.join(os.getcwd(), '.env')
    load_dotenv(dotenv_path=env_path)
    mongo_uri = os.getenv("MONGO_URI")
    
    client = MongoClient(mongo_uri, tls=True, tlsCAFile=certifi.where())
    db = client["eduwrite"]
    user = db.users.find_one({"email": "eduwrite1@gmail.com"})
    
    if user:
        print(f"USER_FOUND: {user['email']}")
    else:
        print("USER_NOT_FOUND")

if __name__ == "__main__":
    check_user()
