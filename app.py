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
except ImportError:
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
        print("AI Error:", e)
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

# =============================
# AI GENERATION API
# =============================
@app.route("/api/generate", methods=["POST"])
@login_required
def generate():
    data = request.get_json()
    topic = data.get("topic", "").strip()
    content_type = data.get("contentType", "Explanation").strip()
    level = data.get("level", "Intermediate").strip()

    if not topic:
        return jsonify({"error": "Topic required"}), 400

    user = User(db.users.find_one({"_id": ObjectId(session["user_id"])}))

    # ---- SIMPLE GREETINGS (NO CREDIT USE) ----
    clean_topic = topic.lower().strip().strip("?").strip("!")

    greetings = ["hi", "hello", "hey", "hi there", "hello there"]
    how_are_you = ["how are you", "how r u", "how are u"]
    who_are_you = ["who are you", "who r u", "who are u"]

    if clean_topic in greetings:
        return jsonify({
            "content": "Hi! I am EduWrite AI. How can I help you today?",
            "credits_left": user.credits
        })

    if clean_topic in how_are_you:
        return jsonify({
            "content": "I am fine, how do you do? Is there anything interesting you would like to know?",
            "credits_left": user.credits
        })

    if clean_topic in who_are_you:
        return jsonify({
            "content": "I am EduWrite AI, your personal learning assistant. How can I help you today?",
            "credits_left": user.credits
        })

    # ---- CREDIT CHECK ----
    if user.credits <= 0:
        return jsonify({"error": "No credits left"}), 402

    ai_client = get_ai_client()

    if ai_client:
        system_prompt = """
You are EduWrite AI.

Allowed Content Types:
Educational: Explanation, Summary, Quiz, Interactive Lesson, Mind Map
Technical: Coding, Research Paper

If the request does NOT fit these, reply only:
"I am not aware of these questions."
"""
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=f"Topic: {topic}\nType: {content_type}\nLevel: {level}")
        ]
        response = ai_client.invoke(messages).content
    else:
        response = "AI service not configured."

    # ---- UPDATE DB ----
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

@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))

# =============================
# RUN
# =============================
if __name__ == "__main__":
    print("🚀 EduWrite running on port 5001")
    app.run(debug=True, port=5001, use_reloader=False)
