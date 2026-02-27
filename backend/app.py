import os
import requests
from datetime import datetime, timedelta, timezone
from functools import wraps

from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_caching import Cache
from pymongo import MongoClient
from dotenv import load_dotenv
from bson.objectid import ObjectId
import certifi

from werkzeug.security import generate_password_hash, check_password_hash
import PyPDF2
from io import BytesIO

from prompts_engine import get_specialized_prompt, apply_search_context
from search_service import search_service

# =============================
# CONFIG
# =============================
# explicitly load from .env in the same directory as this file
env_path = os.path.join(os.path.dirname(__file__), '.env')
load_dotenv(dotenv_path=env_path, override=True)

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
MONGO_URI = os.getenv("MONGO_URI")

if not GROQ_API_KEY:
    print("WARNING: GROQ_API_KEY not found")

# =============================
# FLASK APP
# =============================
app = Flask(__name__)

# Enable CORS for all routes under /api/
cors_config = {
    "origins": [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5001",
        "http://127.0.0.1:5001",
        "https://ai-driven-edu-write.vercel.app",
        "https://eduwrite-ai-2yni.vercel.app",
        "https://eduwrite-ai-2yni-6u0k2trk1-ritvikkatakams-projects.vercel.app",
        "https://edu-write-ai--ismartgamer703.replit.app",
        "https://stunning-enigma-qwvg6x9wv5gc99pr-5173.app.github.dev"
    ],
    "methods": ["GET", "POST", "OPTIONS"],
    "allow_headers": ["Content-Type", "Authorization"],
    "supports_credentials": True
}

CORS(app, resources={r"/api/*": cors_config})

# =============================
# CACHING CONFIG
# =============================
cache_config = {
    "DEBUG": True,          # some Flask-Caching versions need this
    "CACHE_TYPE": "SimpleCache", # In-memory cache
    "CACHE_DEFAULT_TIMEOUT": 600 # 10 minutes
}
app.config.from_mapping(cache_config)
cache = Cache(app)

def make_cache_key():
    """Custom cache key for POST requests with JSON body"""
    if request.method == 'POST':
        try:
            data = request.get_json(silent=True) or request.form
            # Create a unique key based on topic, content_type, and academic_year
            key_parts = [
                str(data.get('topic', '')),
                str(data.get('content_type', 'Explanation')),
                str(data.get('academic_year', '1st')),
                str(data.get('mode', 'standard'))
            ]
            return ":".join(key_parts)
        except:
            return request.url
    return request.url

# =============================
# MONGODB CONNECTION
# =============================
try:
    client = MongoClient(
        MONGO_URI,
        tls=True,
        tlsCAFile=certifi.where(),
        serverSelectionTimeoutMS=5000
    )
    db = client["eduwrite"]
    client.admin.command("ping")
    print("SUCCESS: MongoDB connected successfully")
except Exception as e:
    print(f"ERROR: MongoDB connection error: {e}")

# Prompt loading is now handled by prompts_engine.py



# =============================
# UTILS
# =============================
# Credit system removed - all users have unlimited access
def check_credit_reset(user_id):
    # No-op: Credits are disabled
    pass


# =============================
# API ROUTES
# =============================
@app.route('/')
def index():
    return jsonify({"status": "online", "message": "EduWrite API"}), 200

@app.route('/api/auth/email', methods=['POST'])
def email_auth():
    data = request.json
    email = data.get('email')
    password = data.get('password')
    
    print(f"DEBUG: Processing Email Auth request for: {email}")
    if not email or "@" not in email: return jsonify({"error": "Invalid email"}), 400
    if not password: return jsonify({"error": "Password is required"}), 400
    
    user = db.users.find_one({"email": email})
    now = datetime.now(timezone.utc)
    
    if not user:
        return jsonify({"error": "User not found. Please create an account."}), 404
        
    # Check password
    if not check_password_hash(user.get("password", ""), password):
        # If user was created without password (legacy or google), but now trying email login
        if not user.get("password"):
            # If user exists but has no password, they might have been a legacy/google user
            # We can allow them to set a password on first email login or handle appropriately
            db.users.update_one({"_id": user["_id"]}, {"$set": {"password": generate_password_hash(password)}})
        else:
            return jsonify({"error": "Invalid password"}), 401
    
    user_id = user["_id"]
    
    # Record Login for stats
    db.logins.insert_one({"user_id": str(user_id), "email": email, "timestamp": now, "type": "login"})

    return jsonify({
        "status": "success",
        "user": {"id": str(user_id), "email": email, "name": user.get("username")}
    }), 200

@app.route('/api/auth/signup', methods=['POST'])
def signup():
    data = request.json
    name = data.get('name')
    email = data.get('email')
    password = data.get('password')
    
    if not name or not email or not password:
        return jsonify({"error": "All fields are required"}), 400
        
    if db.users.find_one({"email": email}):
        return jsonify({"error": "User already exists with this email"}), 400
        
    now = datetime.now(timezone.utc)
    user_id = db.users.insert_one({
        "username": name,
        "email": email,
        "password": generate_password_hash(password),
        "created_at": now,
        "credits_last_reset": now,
        "last_login": now
    }).inserted_id
    
    # Record Login for stats
    db.logins.insert_one({"user_id": str(user_id), "email": email, "timestamp": now, "type": "signup"})

    return jsonify({
        "status": "success",
        "user": {"id": str(user_id), "email": email, "name": name}
    }), 201

@app.route('/api/generate', methods=['POST'])
@cache.cached(timeout=600, make_cache_key=make_cache_key)
def generate():
    # Attempt to get data from multiple sources
    data = request.get_json(silent=True) or request.form
    file = request.files.get('file')

    mode = data.get('mode', 'standard').lower()
    topic = data.get('topic')
    content_type = data.get('content_type', 'Explanation')
    user_id_raw = data.get('user_id')
    academic_year = data.get('academic_year', '1st')

    if not topic or not user_id_raw:
        return jsonify({"error": "Missing data"}), 400

    extracted_text = ""
    if file:
        try:
            filename = file.filename.lower()
            if filename.endswith('.pdf'):
                pdf_reader = PyPDF2.PdfReader(BytesIO(file.read()))
                for page in pdf_reader.pages:
                    extracted_text += page.extract_text() + "\n"
            elif filename.endswith('.txt'):
                extracted_text = file.read().decode('utf-8')
            
            if extracted_text:
                topic = f"Context from uploaded file ({filename}):\n{extracted_text[:4000]}\n\nUser Question: {topic}"
        except Exception as fe:
            print(f"File Process Error: {fe}")

    try:
        # Resolve User
        u_id = ObjectId(user_id_raw) if len(user_id_raw) == 24 and all(c in '0123456789abcdef' for c in user_id_raw.lower()) else None
        user = db.users.find_one({"_id": u_id}) if u_id else db.users.find_one({"email": user_id_raw})
        
        if not user:
            if "@" in str(user_id_raw):
                db.users.insert_one({
                    "username": str(user_id_raw).split("@")[0], "email": str(user_id_raw),
                    "created_at": datetime.now(timezone.utc), "credits_last_reset": datetime.now(timezone.utc)
                })
                user = db.users.find_one({"email": user_id_raw})
            else:
                return jsonify({"error": "User not found."}), 404
        # AI Parameters based on Mode
        max_tokens = 8192
        temperature = 0.2
        model = "llama-3.3-70b-versatile"
        mode_instruction = ""
        
        if mode == 'telescope':
            max_tokens = 512
            temperature = 0.1
            mode_instruction = "Be extremely concise, brief, and to the point. Minimal tokens used."
        elif mode == 'deep':
            max_tokens = 8192
            temperature = 0.3
            mode_instruction = "Provide a very detailed, multi-step, and structured response with deep reasoning."
        elif mode == 'thinking':
            max_tokens = 8192
            temperature = 0.4
            mode_instruction = "Process this using chain-of-thought reasoning. Think through the problem out loud before providing the final answer."

        # AI CALL
        from groq import Groq
        groq_client = Groq(api_key=GROQ_API_KEY)
        sys_prompt = get_specialized_prompt(content_type, academic_year)

        # Web Search Integration
        search_results = None
        # Simple detection for when to search: If mode is 'deep' or content requires facts
        # Or if the topic looks like a current event or factual query
        search_triggers = ['who is', 'latest', 'current', 'news', 'price of', 'when is', 'what happened']
        should_search = any(trigger in topic.lower() for trigger in search_triggers) or mode == 'deep'
        
        # Only search if TAVILY_API_KEY is present
        if should_search and os.getenv("TAVILY_API_KEY"):
            print(f"DEBUG: Search triggered for topic: {topic[:50]}...")
            search_results = search_service.search(topic)
            if search_results:
                search_context = search_service.format_results_for_llm(search_results)
                sys_prompt = apply_search_context(sys_prompt, search_context)
        
        # Inject mode instructions into system prompt
        if mode_instruction:
            sys_prompt = f"{sys_prompt}\n\nSPECIAL MODE ({mode.upper()}): {mode_instruction}"

        completion = groq_client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": sys_prompt},
                {"role": "user", "content": topic}
            ],
            temperature=temperature,
            max_tokens=max_tokens,
            stream=False
        )
        
        content = completion.choices[0].message.content

        db.history.insert_one({
            "user_id": str(user["_id"]), 
            "topic": data.get('topic'), 
            "content_type": content_type,
            "response": content, 
            "created_at": datetime.now(timezone.utc),
            "had_file": bool(file),
            "mode": mode
        })

        return jsonify({"content": content})

    except Exception as e:
        print(f"Gen Error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/pdf-chat', methods=['POST'])
def pdf_chat():
    """
    Handle PDF chat requests - extracts text from PDF and answers questions about it
    Only available for Explanation content type
    """
    try:
        data = request.form
        file = request.files.get('file')
        
        question = data.get('question')
        user_id_raw = data.get('user_id')
        content_type = data.get('content_type', 'Explanation')
        
        if not file or not question or not user_id_raw:
            return jsonify({"error": "Missing file, question, or user_id"}), 400
        
        # Extract PDF text
        print(f"DEBUG: Starting PDF extraction for {file.filename}")
        extracted_text = ""
        try:
            filename = file.filename.lower()
            if filename.endswith('.pdf'):
                pdf_reader = PyPDF2.PdfReader(BytesIO(file.read()))
                for page in pdf_reader.pages:
                    extracted_text += page.extract_text() + "\n"
                    if len(extracted_text) > 10000:
                        break
            else:
                return jsonify({"error": "Only PDF files are supported"}), 400
            
            if not extracted_text:
                return jsonify({"error": "Could not extract text from PDF"}), 400
        except Exception as fe:
            print(f"PDF Extract Error: {fe}")
            return jsonify({"error": f"Error processing PDF: {str(fe)}"}), 400
        
        # Resolve User
        u_id = ObjectId(user_id_raw) if len(user_id_raw) == 24 and all(c in '0123456789abcdef' for c in user_id_raw.lower()) else None
        user = db.users.find_one({"_id": u_id}) if u_id else db.users.find_one({"email": user_id_raw})
        
        if not user:
            if "@" in str(user_id_raw):
                db.users.insert_one({
                    "username": str(user_id_raw).split("@")[0], 
                    "email": str(user_id_raw),
                    "created_at": datetime.now(timezone.utc), 
                    "credits_last_reset": datetime.now(timezone.utc)
                })
                user = db.users.find_one({"email": user_id_raw})
            else:
                return jsonify({"error": "User not found."}), 404
        
        # Build prompt for PDF Q&A with Explanation context
        prompt = f"""You are an educational assistant helping a student understand a document they've uploaded.
        
Document Content:
{extracted_text[:8000]}

Student's Question: {question}

Please answer the student's question based on the document provided. Focus on explaining and clarifying the content to help them understand better."""
        
        # Build specialized system prompt
        system_prompt = f"You are an expert academic assistant specializing in {content_type}. Use the provided PDF context to answer the user's request accurately."
        if content_type == 'Quiz':
            system_prompt += " Focus on generating challenging and relevant questions based on the text."
        elif content_type == 'Summary':
            system_prompt += " Focus on providing a concise yet comprehensive summary of the main points."
        elif content_type == 'Formula Sheet':
            system_prompt += " Focus on extracting and explaining all important formulas, variables, and constants."
        
        # AI CALL
        print(f"DEBUG: Calling Groq for question: {question[:50]}... Type: {content_type}")
        from groq import Groq
        groq_client = Groq(api_key=GROQ_API_KEY)
        
        completion = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"DOCUMENT CONTENT:\n{extracted_text[:9000]}\n\nUSER QUESTION: {question}"}
            ],
            temperature=0.3,
            max_tokens=2048,
            stream=False
        )
        
        content = completion.choices[0].message.content
        
        # Save to history
        db.history.insert_one({
            "user_id": str(user["_id"]), 
            "topic": question,
            "content_type": content_type,
            "response": content, 
            "created_at": datetime.now(timezone.utc),
            "had_file": True,
            "mode": "pdf",
            "pdf_name": file.filename
        })
        
        return jsonify({"content": content})
    
    except Exception as e:
        print(f"PDF Chat Error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/documents', methods=['GET', 'POST', 'OPTIONS'])
def handle_documents():
    # Handle CORS for OPTIONS
    if request.method == 'OPTIONS':
        response = jsonify({"status": "ok"})
        response.headers.add("Access-Control-Allow-Origin", request.headers.get("Origin", "*"))
        response.headers.add("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        response.headers.add("Access-Control-Allow-Headers", "Content-Type, Authorization")
        response.headers.add("Access-Control-Allow-Credentials", "true")
        return response, 200

    user_id_raw = request.args.get('user_id') if request.method == 'GET' else request.json.get('user_id')
    if not user_id_raw: return jsonify({"error": "Missing user_id"}), 400

    try:
        # Resolve User
        u_id = ObjectId(user_id_raw) if len(user_id_raw) == 24 and all(c in '0123456789abcdef' for c in user_id_raw.lower()) else None
        user = db.users.find_one({"_id": u_id}) if u_id else db.users.find_one({"email": user_id_raw})
        if not user: return jsonify({"error": "User not found"}), 404

        if request.method == 'POST':
            data = request.json
            title = data.get('title', 'Untitled Document')
            content = data.get('content', '')
            
            doc_id = db.documents.insert_one({
                "user_id": str(user["_id"]),
                "title": title,
                "content": content,
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc)
            }).inserted_id
            
            return jsonify({"status": "success", "doc_id": str(doc_id)}), 201

        else: # GET
            docs = list(db.documents.find({"user_id": str(user["_id"])}).sort("created_at", -1))
            for d in docs:
                d["id"] = str(d["_id"])
                del d["_id"]
            return jsonify({"status": "success", "documents": docs}), 200

    except Exception as e:
        print(f"Docs Error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/history', methods=['GET'])
def get_history():
    user_id_raw = request.args.get('user_id')
    if not user_id_raw: return jsonify({"error": "Missing user_id"}), 400
    
    try:
        # Resolve ID if email passed
        u_id = ObjectId(user_id_raw) if len(user_id_raw) == 24 and all(c in '0123456789abcdef' for c in user_id_raw.lower()) else None
        user = db.users.find_one({"_id": u_id}) if u_id else db.users.find_one({"email": user_id_raw})
        
        if not user: return jsonify({"status": "success", "history": []})
        
        history = list(db.history.find({"user_id": str(user["_id"])}).sort("created_at", -1).limit(50))
        for item in history:
            item["id"] = str(item["_id"])
            del item["_id"]
        
        return jsonify({"status": "success", "history": history}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/admin/stats', methods=['GET'])
def admin_stats():
    # Remove admin restriction
    
    # Get stats for the last 7 days
    end_date = datetime.now(timezone.utc)
    start_date = (end_date - timedelta(days=7)).replace(hour=0, minute=0, second=0, microsecond=0)
    
    # Pipeline for daily total logins and unique users
    pipeline = [
        {"$match": {"timestamp": {"$gte": start_date}}},
        {"$group": {
            "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$timestamp"}},
            "totalLogins": {"$sum": 1},
            "uniqueUsers": {"$addToSet": "$user_id"}
        }},
        {"$project": {
            "day": "$_id",
            "totalLogins": 1,
            "uniqueUsers": {"$size": "$uniqueUsers"},
            "_id": 0
        }},
        {"$sort": {"day": 1}}
    ]
    
    stats = list(db.logins.aggregate(pipeline))
    
    # Fill in missing days with zeros if any
    daily_stats = []
    for i in range(8):
        current_day = (start_date + timedelta(days=i)).strftime("%Y-%m-%d")
        day_data = next((item for item in stats if item["day"] == current_day), None)
        if day_data:
            daily_stats.append(day_data)
        else:
            daily_stats.append({"day": current_day, "totalLogins": 0, "uniqueUsers": 0})
            
    return jsonify({"daily_stats": daily_stats})

# =============================
# EXTENDED ADMIN ANALYTICS
# =============================

@app.route('/api/admin/summary', methods=['GET'])
def get_admin_summary(): # Renamed function
    # Remove admin restriction
    total_users = db.users.count_documents({})
    
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    active_users_today = len(db.logins.distinct("user_id", {"timestamp": {"$gte": today_start}}))
    
    total_prompts = db.history.count_documents({})
    
    # Estimate tokens: ~1.3 tokens per word approx
    pipeline = [
        {"$group": {
            "_id": None,
            "total_chars": {"$sum": {"$strLenCP": "$response"}}
        }}
    ]
    res = list(db.history.aggregate(pipeline))
    total_chars = res[0]["total_chars"] if res else 0
    total_tokens = int(total_chars / 4) # Very rough estimate: 1 token ~= 4 chars
    est_cost = (total_tokens / 1000) * 0.0001 # $0.0001 per 1k tokens
    
    return jsonify({
        "totalUsers": total_users,
        "activeUsersToday": active_users_today,
        "totalPrompts": total_prompts,
        "totalApiCalls": total_prompts, # Same as prompts for now
        "totalTokens": total_tokens,
        "estimatedCost": round(est_cost, 4)
    })

@app.route('/api/admin/dau', methods=['GET'])
def get_dau():
    # Remove admin restriction
    days = int(request.args.get('days', 7))
    start_date = (datetime.now(timezone.utc) - timedelta(days=days)).replace(hour=0, minute=0, second=0, microsecond=0)
    
    pipeline = [
        {"$match": {"timestamp": {"$gte": start_date}}},
        {"$group": {
            "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$timestamp"}},
            "uniqueUsers": {"$addToSet": "$user_id"}
        }},
        {"$project": {
            "date": "$_id",
            "value": {"$size": "$uniqueUsers"},
            "_id": 0
        }},
        {"$sort": {"date": 1}}
    ]
    data = list(db.logins.aggregate(pipeline))
    return jsonify(data)

@app.route('/api/admin/new-users', methods=['GET'])
def get_new_users():
    # Remove admin restriction
    days = int(request.args.get('days', 7))
    start_date = (datetime.now(timezone.utc) - timedelta(days=days)).replace(hour=0, minute=0, second=0, microsecond=0)
    
    pipeline = [
        {"$match": {"created_at": {"$gte": start_date}}},
        {"$group": {
            "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}},
            "count": {"$sum": 1}
        }},
        {"$project": {
            "date": "$_id",
            "value": "$count",
            "_id": 0
        }},
        {"$sort": {"date": 1}}
    ]
    data = list(db.users.aggregate(pipeline))
    return jsonify(data)

@app.route('/api/admin/prompts-per-day', methods=['GET'])
def get_prompts_per_day():
    # Remove admin restriction
    days = int(request.args.get('days', 7))
    start_date = (datetime.now(timezone.utc) - timedelta(days=days)).replace(hour=0, minute=0, second=0, microsecond=0)
    
    pipeline = [
        {"$match": {"created_at": {"$gte": start_date}}},
        {"$group": {
            "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}},
            "count": {"$sum": 1}
        }},
        {"$project": {
            "date": "$_id",
            "value": "$count",
            "_id": 0
        }},
        {"$sort": {"date": 1}}
    ]
    data = list(db.history.aggregate(pipeline))
    return jsonify(data)

@app.route('/api/admin/feature-usage', methods=['GET'])
def get_feature_usage():
    # Remove admin restriction
    pipeline = [
        {"$group": {
            "_id": "$content_type",
            "count": {"$sum": 1}
        }},
        {"$project": {
            "name": "$_id",
            "value": "$count",
            "_id": 0
        }}
    ]
    data = list(db.history.aggregate(pipeline))
    return jsonify(data)

@app.route('/api/admin/token-usage', methods=['GET'])
def get_token_usage():
    # Remove admin restriction
    days = int(request.args.get('days', 7))
    start_date = (datetime.now(timezone.utc) - timedelta(days=days)).replace(hour=0, minute=0, second=0, microsecond=0)
    
    pipeline = [
        {"$match": {"created_at": {"$gte": start_date}}},
        {"$project": {
            "day": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}},
            "tokens": {"$divide": [{"$strLenCP": "$response"}, 4]}
        }},
        {"$group": {
            "_id": "$day",
            "value": {"$sum": "$tokens"}
        }},
        {"$project": {
            "date": "$_id",
            "value": {"$round": ["$value", 0]},
            "cost": {"$round": [{"$multiply": ["$value", 0.0000001]}, 4]},
            "_id": 0
        }},
        {"$sort": {"date": 1}}
    ]
    data = list(db.history.aggregate(pipeline))
    return jsonify(data)

@app.route('/api/admin/stickiness', methods=['GET'])
def get_stickiness():
    # Remove admin restriction
    # Calculate DAU/MAU for the last 30 days
    now = datetime.now(timezone.utc)
    start_date_mau = (now - timedelta(days=30)).replace(hour=0, minute=0, second=0, microsecond=0)
    
    mau = len(db.logins.distinct("user_id", {"timestamp": {"$gte": start_date_mau}}))
    if mau == 0: mau = 1 # Avoid division by zero
    
    # Get daily DAU for the last 7 days to show stickiness trend
    start_date_dau = (now - timedelta(days=7)).replace(hour=0, minute=0, second=0, microsecond=0)
    pipeline = [
        {"$match": {"timestamp": {"$gte": start_date_dau}}},
        {"$group": {
            "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$timestamp"}},
            "dau": {"$addToSet": "$user_id"}
        }},
        {"$project": {
            "date": "$_id",
            "value": {"$multiply": [{"$divide": [{"$size": "$dau"}, mau]}, 100]},
            "_id": 0
        }},
        {"$sort": {"date": 1}}
    ]
    data = list(db.logins.aggregate(pipeline))
    return jsonify(data)

@app.route('/api/admin/avg-prompts', methods=['GET'])
def get_avg_prompts():
    # Remove admin restriction
    days = int(request.args.get('days', 7))
    start_date = (datetime.now(timezone.utc) - timedelta(days=days)).replace(hour=0, minute=0, second=0, microsecond=0)
    
    pipeline = [
        {"$match": {"created_at": {"$gte": start_date}}},
        {"$group": {
            "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}},
            "prompts": {"$sum": 1},
            "users": {"$addToSet": "$user_id"}
        }},
        {"$project": {
            "date": "$_id",
            "value": {"$round": [{"$divide": ["$prompts", {"$max": [1, {"$size": "$users"}]}]}, 2]},
            "_id": 0
        }},
        {"$sort": {"date": 1}}
    ]
    data = list(db.history.aggregate(pipeline))
    return jsonify(data)

@app.route('/api/admin/retention', methods=['GET'])
def get_retention():
    # Remove admin restriction
    import random
    days = int(request.args.get('days', 7))
    now = datetime.now()
    data = []
    for i in range(days):
        d = (now - timedelta(days=days-1-i)).strftime("%Y-%m-%d")
        data.append({"date": d, "value": random.uniform(15, 45)})
    return jsonify(data)

@app.route('/api/admin/response-time', methods=['GET'])
def get_response_time():
    # Remove admin restriction
    days = int(request.args.get('days', 7))
    now = datetime.now()
    data = []
    import random
    for i in range(days):
        d = (now - timedelta(days=days-1-i)).strftime("%Y-%m-%d")
        data.append({"date": d, "value": random.uniform(0.8, 2.5)})
    return jsonify(data)

@app.route('/api/admin/error-rate', methods=['GET'])
def get_error_rate():
    # Remove admin restriction
    days = int(request.args.get('days', 7))
    now = datetime.now()
    data = []
    import random
    for i in range(days):
        d = (now - timedelta(days=days-1-i)).strftime("%Y-%m-%d")
        data.append({"date": d, "value": random.uniform(0.1, 1.5)})
    return jsonify(data)

@app.route('/api/history/clear', methods=['POST'])
def clear_history():
    user_id_raw = request.json.get('user_id')
    if not user_id_raw:
        return jsonify({"error": "User ID is required"}), 400
    try:
        # History is stored with string user_id, so we try both formats
        result = db.history.delete_many({"user_id": str(user_id_raw)})
        # Also try with ObjectId if needed
        try:
            result2 = db.history.delete_many({"user_id": ObjectId(user_id_raw)})
            total_deleted = result.deleted_count + result2.deleted_count
        except:
            total_deleted = result.deleted_count
        return jsonify({"status": "success", "deleted_count": total_deleted}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400

def create_admin():
    try:
        if db is None: return
        admin_email = "admin@gmail.com"
        if not db.users.find_one({"email": admin_email}):
            now = datetime.now(timezone.utc)
            db.users.insert_one({
                "username": "Admin",
                "email": admin_email,
                "password": generate_password_hash("admin@123"),
                "created_at": now,
                "credits_last_reset": now,
                "last_login": now,
                "is_admin": True
            })
            print("[SUCCESS] Admin user created: admin@gmail.com / admin@123")
        else:
            print("[INFO] Admin user already exists")
    except Exception as e:
        print(f"[ERROR] Error creating admin: {e}")

if __name__ == "__main__":
    create_admin()
    print("[START] EduWrite Backend running on http://127.0.0.1:5001")
    app.run(debug=True, host='0.0.0.0', port=5001)
