import os
from datetime import datetime, timedelta, timezone
from functools import wraps

from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from pymongo import MongoClient
from werkzeug.security import generate_password_hash, check_password_hash
from dotenv import load_dotenv
from bson.objectid import ObjectId
import certifi

# =============================
# CONFIG
# =============================
DAILY_CREDITS = 50000

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

# MongoDB Atlas URI
MONGO_URI = (
    "mongodb+srv://eduwrite:eduwritedb@cluster0.4lvzym0.mongodb.net/"
    "eduwrite?retryWrites=true&w=majority"
)

# =============================
# AI IMPORTS
# =============================
try:
    from langchain_groq import ChatGroq
    from langchain_core.messages import HumanMessage, SystemMessage
    AI_AVAILABLE = True
except ImportError as e:
    print(f"❌ AI Import Error: {e}")
    AI_AVAILABLE = False

def get_ai_client():
    if not AI_AVAILABLE or not GROQ_API_KEY:
        return None
    try:
        return ChatGroq(
            model_name="llama-3.3-70b-versatile",
            temperature=0.7,
            api_key=GROQ_API_KEY
        )
    except Exception as e:
        print("AI Error (get_ai_client):", e)
        return None

# =============================
# FLASK APP
# =============================
app = Flask(__name__)
app.secret_key = SECRET_KEY
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=7)

# =============================
# MONGODB CONNECTION
# =============================
db = None
connection_error = None

try:
    client = MongoClient(
        MONGO_URI,
        tls=True,
        tlsCAFile=certifi.where(),
        serverSelectionTimeoutMS=10000
    )
    client.admin.command("ping")
    db = client["eduwrite"]
    print("✅ MongoDB Atlas connected successfully")
except Exception as e:
    connection_error = str(e)
    print("❌ MongoDB connection failed:", e)

# =============================
# USER MODEL
# =============================
class User:
    def __init__(self, data):
        self.id = str(data["_id"])
        self.username = data["username"]
        self.email = data["email"]
        self.password_hash = data["password_hash"]
        self.credits = data.get("credits", 0)
        self.created_at = data.get("created_at")
        self.credits_last_reset = data.get("credits_last_reset")
        self.is_admin = data.get("is_admin", 0)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def reset_credits_if_needed(self):
        now = datetime.now(timezone.utc)
        last_reset = self.credits_last_reset or self.created_at
        if last_reset.tzinfo is None:
            last_reset = last_reset.replace(tzinfo=timezone.utc)

        if now.date() > last_reset.date():
            db.users.update_one(
                {"_id": ObjectId(self.id)},
                {"$set": {"credits": DAILY_CREDITS, "credits_last_reset": now}}
            )
            self.credits = DAILY_CREDITS

# =============================
# ADMIN CREATION
# =============================
def create_admin():
    if db is None:
        return
    if not db.users.find_one({"username": "admin"}):
        db.users.insert_one({
            "username": "admin",
            "email": "admin@example.com",
            "password_hash": generate_password_hash("admin"),
            "credits": DAILY_CREDITS,
            "created_at": datetime.utcnow(),
            "credits_last_reset": datetime.utcnow(),
            "is_admin": 1
        })
        print("✅ Admin created (admin/admin)")

create_admin()

# =============================
# AUTH DECORATOR
# =============================
def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if "user_id" not in session:
            return redirect(url_for("login"))
        return f(*args, **kwargs)
    return wrapper

# =============================
# ROUTES
# =============================
@app.route("/")
def index():
    return redirect(url_for("home")) if "user_id" in session else redirect(url_for("login"))

@app.route("/login", methods=["GET", "POST"])
def login():
    if db is None:
        return "Database unavailable", 503

    if request.method == "POST":
        user_data = db.users.find_one({"username": request.form["username"]})
        if user_data:
            user = User(user_data)
            if user.check_password(request.form["password"]):
                session["user_id"] = user.id
                session["username"] = user.username
                session.permanent = True
                
                # Record login activity
                db.logins.insert_one({
                    "user_id": user.id,
                    "username": user.username,
                    "login_time": datetime.utcnow(),
                    "ip_address": request.remote_addr,
                    "user_agent": request.headers.get("User-Agent")
                })
                
                return redirect(url_for("home"))
        return render_template("login.html", error="Invalid credentials")

    return render_template("login.html")

@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "POST":
        if db.users.find_one({"username": request.form["username"]}):
            return render_template("register.html", error="User already exists")

        db.users.insert_one({
            "username": request.form["username"],
            "email": request.form["email"],
            "password_hash": generate_password_hash(request.form["password"]),
            "credits": DAILY_CREDITS,
            "created_at": datetime.utcnow(),
            "credits_last_reset": datetime.utcnow(),
            "is_admin": 0
        })
        return redirect(url_for("login"))

    return render_template("register.html")

@app.route("/home")
@login_required
def home():
    user = User(db.users.find_one({"_id": ObjectId(session["user_id"])}))
    user.reset_credits_if_needed()
    history = list(db.usage.find({"user_id": user.id}).sort("created_at", -1))
    return render_template("home.html", user=user, history=history)

@app.route("/history")
@login_required
def history():
    user_id = session["user_id"]
    usages = list(db.usage.find({"user_id": user_id}).sort("created_at", -1))
    return render_template("history.html", usages=usages)

@app.route("/login-history")
@login_required
def login_history():
    user_id = session["user_id"]
    logins = list(db.logins.find({"user_id": user_id}).sort("login_time", -1))
    return render_template("login_history.html", logins=logins)

@app.route("/about")
def about():
    return render_template("about.html")

# =============================
# AI GENERATION API (FIXED)
# =============================
@app.route("/api/generate", methods=["POST"])
@login_required
def generate():
    try:
        data = request.get_json()
        topic = data.get("topic", "").strip()
        content_type = data.get("contentType", "Explanation").strip()
        level = data.get("level", "Intermediate").strip()

        if not topic:
            print("❌ Missing topic")
            return jsonify({"error": "Topic is required"}), 400

        print(f"📩 Request for: {topic} | Type: {content_type} | Level: {level}")

        user_data = db.users.find_one({"_id": ObjectId(session["user_id"])})
        if not user_data:
            return jsonify({"error": "User not found"}), 404
        
        user = User(user_data)
        print(f"👤 User: {user.username} | Credits: {user.credits}")

        if user.credits <= 0:
            return jsonify({"error": "No credits left"}), 402

        # PRE-DEFINED GREETING RESPONSES
        greetings = ["hi", "hello", "hey", "how are you", "hi there", "hello there", "good morning", "good afternoon", "good evening"]
        clean_topic = topic.lower().strip().strip('?').strip('!')
        
        if clean_topic in greetings:
            response = "Hi! I am EduWrite, your personal AI assistant. I am fine, how do you do? Is there anything interesting you would like to know?"
            return jsonify({
                "content": response,
                "credits_left": user.credits
            })

        ai_client = get_ai_client()

        if ai_client:
            print("🤖 Calling AI...")
            system_prompt = """
You are EduWrite, an educational and technical AI assistant.
You MUST follow the content structure exactly based on Content Type.
Allowed types: Educational: Explanation, Summary, Quiz, Interactive Lesson, Mind Map; Technical: Coding, Research Paper.
If the request is outside these, reply: "I am not aware of these questions."
"""
            user_prompt = f"Topic: {topic}\nContent Type: {content_type}\nLevel: {level}"

            messages = [
                SystemMessage(content=system_prompt),
                HumanMessage(content=user_prompt)
            ]

            result = ai_client.invoke(messages)
            response = result.content
            print(f"✅ AI Response Received ({len(response)} chars)")
        else:
            print("⚠️ AI client configuration missing or failed")
            response = "AI service not configured."

        db.users.update_one(
            {"_id": ObjectId(user.id)},
            {"$inc": {"credits": -1}}
        )

        db.usage.insert_one({
            "user_id": user.id,
            "topic": topic,
            "response": response,
            "created_at": datetime.utcnow()
        })

        return jsonify({
            "content": response,
            "credits_left": user.credits - 1
        })
    except Exception as e:
        print(f"🔥 Critical Generation Error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))

# =============================
# RUN
# =============================
if __name__ == "__main__":
    print("🚀 EduWrite running on http://127.0.0.1:5001")
    app.run(debug=True, port=5001, use_reloader=False)
