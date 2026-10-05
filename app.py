import os
import sys
import io
import csv
import json
import tempfile
from flask import Flask, render_template, request, jsonify, send_file, Response, session
from dotenv import load_dotenv

# Ensure utf-8 output encoding
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

load_dotenv()

from config import (
    BASE_DIR,
    AVAILABLE_MODELS,
    TRANSLATION_TONES,
    SUPPORTED_LANGUAGES,
    DEFAULT_PROFILE,
)
from database import (
    init_db,
    create_user,
    authenticate_user,
    get_user_by_id,
    get_profile,
    save_profile,
    get_raw_custom_api_key,
    add_history,
    get_history,
    toggle_favorite,
    delete_history_item,
    clear_all_history,
)
from engine import (
    translate_with_gemini,
    test_api_key,
    text_to_speech_mp3,
)

app = Flask(__name__)
# Set SECRET_KEY in the environment for sessions that remain valid across restarts.
# The random fallback avoids shipping a predictable signing key.
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY") or os.urandom(32)
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"

# Initialize database
init_db()

def get_active_user_id():
    return session.get("user_id")

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/sw.js")
def service_worker():
    sw_path = os.path.join(BASE_DIR, "static", "sw.js")
    if os.path.exists(sw_path):
        return send_file(sw_path, mimetype="application/javascript")
    return Response("// Service worker disabled", mimetype="application/javascript")

# -------------------------------------------------------------
# System Status & Health Check (Real Connection State)
# -------------------------------------------------------------
@app.route("/api/health", methods=["GET"])
@app.route("/api/status", methods=["GET"])
def health_check():
    env_key_present = bool(os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY"))
    user_id = get_active_user_id()
    has_user_key = bool(get_raw_custom_api_key(user_id)) if user_id else False
    
    return jsonify({
        "status": "online",
        "service": "Gemini 3.8 Flash",
        "gemini_connected": bool(env_key_present or has_user_key),
        "model": "gemini-3.8-flash"
    })

# -------------------------------------------------------------
# Authentication Endpoints
# -------------------------------------------------------------
@app.route("/api/auth/me", methods=["GET"])
def auth_me():
    user_id = get_active_user_id()
    if not user_id:
        return jsonify({"authenticated": False, "user": None, "profile": None})
    
    user = get_user_by_id(user_id)
    if not user:
        session.clear()
        return jsonify({"authenticated": False, "user": None, "profile": None})
        
    profile = get_profile(user_id)
    return jsonify({
        "authenticated": True,
        "user": user,
        "profile": profile
    })

@app.route("/api/auth/signup", methods=["POST"])
def auth_signup():
    data = request.get_json(force=True, silent=True) or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip()
    password = data.get("password") or ""
    confirm_password = data.get("confirm_password") or ""
    avatar = data.get("avatar") or "astronaut"

    if not name:
        return jsonify({"success": False, "error": "Please enter your name."}), 400
    if not email or "@" not in email:
        return jsonify({"success": False, "error": "Please enter a valid email address."}), 400
    if len(password) < 6:
        return jsonify({"success": False, "error": "Password must be at least 6 characters long."}), 400
    if password != confirm_password:
        return jsonify({"success": False, "error": "Passwords do not match."}), 400

    try:
        user = create_user(email=email, password=password, name=name, avatar=avatar)
        session["user_id"] = user["id"]
        profile = get_profile(user["id"])
        return jsonify({
            "success": True,
            "user": user,
            "profile": profile,
            "message": "Account created successfully!"
        })
    except ValueError as e:
        return jsonify({"success": False, "error": str(e)}), 400
    except Exception as e:
        return jsonify({"success": False, "error": f"Failed to create account: {str(e)}"}), 500

@app.route("/api/auth/login", methods=["POST"])
def auth_login():
    data = request.get_json(force=True, silent=True) or {}
    email = (data.get("email") or "").strip()
    password = data.get("password") or ""

    if not email or not password:
        return jsonify({"success": False, "error": "Please enter both email and password."}), 400

    user = authenticate_user(email, password)
    if not user:
        return jsonify({"success": False, "error": "Invalid email or password."}), 401

    session["user_id"] = user["id"]
    profile = get_profile(user["id"])
    return jsonify({
        "success": True,
        "user": user,
        "profile": profile,
        "message": "Signed in successfully!"
    })

@app.route("/api/auth/logout", methods=["POST"])
def auth_logout():
    session.clear()
    return jsonify({"success": True, "message": "Signed out successfully."})

# -------------------------------------------------------------
# Configuration & Language Metadata
# -------------------------------------------------------------
@app.route("/api/config", methods=["GET"])
def get_app_config():
    env_key_present = bool(os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY"))
    user_id = get_active_user_id()
    profile = get_profile(user_id) if user_id else get_profile("default")
    user = get_user_by_id(user_id) if user_id else None

    return jsonify({
        "languages": SUPPORTED_LANGUAGES,
        "tones": TRANSLATION_TONES,
        "models": AVAILABLE_MODELS,
        "env_key_present": env_key_present,
        "profile": profile,
        "user": user,
        "authenticated": bool(user_id and user)
    })

# -------------------------------------------------------------
# Translation Engine Route
# -------------------------------------------------------------
@app.route("/api/translate", methods=["POST"])
def translate_text():
    user_id = get_active_user_id()
    if not user_id:
        return jsonify({"success": False, "error": "Authentication required. Please sign in.", "auth_required": True}), 401

    data = request.get_json(force=True, silent=True) or {}
    text = (data.get("text") or "").strip()
    if not text:
        return jsonify({"success": False, "error": "No text provided"}), 400

    target_lang = data.get("target_lang", "es")
    source_lang = data.get("source_lang", "auto")
    tone = data.get("tone", "natural")
    model = data.get("model", "gemini-3.8-flash")
    save_to_history = data.get("save_history", True)

    # Server securely retrieves raw custom key if user configured one
    raw_user_key = get_raw_custom_api_key(user_id)
    custom_api_key = raw_user_key or None

    result = translate_with_gemini(
        text=text,
        target_lang=target_lang,
        source_lang=source_lang,
        tone=tone,
        model=model,
        custom_api_key=custom_api_key,
    )

    history_id = None
    if result.get("success") and save_to_history and result.get("translated_text"):
        history_id = add_history(
            source_lang=result.get("detected_source_lang", source_lang),
            target_lang=target_lang,
            source_text=text,
            translated_text=result.get("translated_text", ""),
            pronunciation=result.get("pronunciation", ""),
            notes=result.get("nuance_note", ""),
            tone=tone,
            engine=result.get("engine", "Gemini"),
            profile_id=user_id,
        )

    result["history_id"] = history_id
    return jsonify(result)

# -------------------------------------------------------------
# API Key Verification
# -------------------------------------------------------------
@app.route("/api/test-key", methods=["POST"])
def verify_key():
    user_id = get_active_user_id()
    if not user_id:
        return jsonify({"valid": False, "message": "Authentication required."}), 401

    data = request.get_json(force=True, silent=True) or {}
    api_key_input = (data.get("api_key") or "").strip()

    # If user provided a masked key or empty, use their stored raw key
    if not api_key_input or "•" in api_key_input:
        api_key_input = get_raw_custom_api_key(user_id)

    res = test_api_key(api_key_input)
    return jsonify(res)

# -------------------------------------------------------------
# User Profile Handler
# -------------------------------------------------------------
@app.route("/api/profile", methods=["GET", "POST"])
def profile_handler():
    user_id = get_active_user_id()
    if not user_id:
        return jsonify({"error": "Authentication required", "auth_required": True}), 401

    if request.method == "POST":
        data = request.get_json(force=True, silent=True) or {}
        updated = save_profile(data, user_id)
        user = get_user_by_id(user_id)
        return jsonify({"success": True, "profile": updated, "user": user})
    else:
        profile = get_profile(user_id)
        user = get_user_by_id(user_id)
        return jsonify({"profile": profile, "user": user})

# -------------------------------------------------------------
# Translation History Endpoints
# -------------------------------------------------------------
@app.route("/api/history", methods=["GET", "DELETE"])
def history_handler():
    user_id = get_active_user_id()
    if not user_id:
        return jsonify({"items": []})

    if request.method == "DELETE":
        item_id = request.args.get("id")
        if item_id:
            delete_history_item(int(item_id), profile_id=user_id)
            return jsonify({"success": True, "message": f"Deleted item {item_id}"})
        else:
            only_non_favs = request.args.get("keep_favorites", "false").lower() == "true"
            clear_all_history(user_id, only_non_favorites=only_non_favs)
            return jsonify({"success": True, "message": "History cleared"})

    query = request.args.get("query")
    favorites_only = request.args.get("favorites_only", "false").lower() == "true"
    limit = int(request.args.get("limit", 100))
    items = get_history(limit=limit, query=query, favorites_only=favorites_only, profile_id=user_id)
    return jsonify({"items": items})

@app.route("/api/history/favorite", methods=["POST"])
def toggle_fav():
    user_id = get_active_user_id()
    if not user_id:
        return jsonify({"success": False, "error": "Authentication required"}), 401

    data = request.get_json(force=True, silent=True) or {}
    history_id = data.get("id")
    if not history_id:
        return jsonify({"success": False, "error": "History ID required"}), 400
    is_fav = toggle_favorite(int(history_id), profile_id=user_id)
    return jsonify({"success": True, "is_favorite": is_fav})

# -------------------------------------------------------------
# Speech & Audio TTS / Transcribe
# -------------------------------------------------------------
@app.route("/api/tts", methods=["POST", "GET"])
def tts_stream():
    if request.method == "POST":
        data = request.get_json(force=True, silent=True) or {}
        text = data.get("text", "")
        lang = data.get("lang", "en")
    else:
        text = request.args.get("text", "")
        lang = request.args.get("lang", "en")

    if not text:
        return jsonify({"error": "No text provided"}), 400

    audio_data = text_to_speech_mp3(text, lang)
    if not audio_data:
        return jsonify({"error": "Failed to synthesize speech"}), 500

    return send_file(
        io.BytesIO(audio_data),
        mimetype="audio/mpeg",
        as_attachment=False,
        download_name="translation.mp3",
    )

@app.route("/api/transcribe", methods=["POST"])
def transcribe_audio_file():
    user_id = get_active_user_id()
    if not user_id:
        return jsonify({"success": False, "error": "Authentication required"}), 401

    if "audio" not in request.files:
        return jsonify({"success": False, "error": "No audio file uploaded"}), 400

    file = request.files["audio"]
    target_lang = request.form.get("lang", "en-US")

    temp_audio = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
    file.save(temp_audio.name)
    temp_audio.close()

    try:
        import speech_recognition as sr
        recognizer = sr.Recognizer()
        with sr.AudioFile(temp_audio.name) as source:
            audio = recognizer.record(source)
            text = recognizer.recognize_google(audio, language=target_lang)
            return jsonify({"success": True, "text": text})
    except Exception as e:
        return jsonify({"success": False, "error": f"Transcription error: {str(e)}"}), 400
    finally:
        try:
            os.remove(temp_audio.name)
        except OSError:
            pass

@app.route("/api/export", methods=["GET"])
def export_history():
    user_id = get_active_user_id()
    if not user_id:
        return jsonify({"error": "Authentication required"}), 401

    fmt = request.args.get("format", "json").lower()
    items = get_history(limit=500, favorites_only=False, profile_id=user_id)

    if fmt == "csv":
        si = io.StringIO()
        writer = csv.writer(si)
        writer.writerow(["ID", "Timestamp", "Source Lang", "Target Lang", "Source Text", "Translated Text", "Pronunciation", "Notes", "Tone", "Engine", "Favorite"])
        for item in items:
            writer.writerow([
                item.get("id"),
                item.get("timestamp"),
                item.get("source_lang"),
                item.get("target_lang"),
                item.get("source_text"),
                item.get("translated_text"),
                item.get("pronunciation"),
                item.get("notes"),
                item.get("tone"),
                item.get("engine"),
                "Yes" if item.get("is_favorite") else "No",
            ])
        output = io.BytesIO(si.getvalue().encode("utf-8-sig"))
        return send_file(
            output,
            mimetype="text/csv",
            as_attachment=True,
            download_name="translations_export.csv",
        )
    else:
        output = io.BytesIO(json.dumps(items, indent=2, ensure_ascii=False).encode("utf-8"))
        return send_file(
            output,
            mimetype="application/json",
            as_attachment=True,
            download_name="translations_export.json",
        )

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"🌟 OmniTranslate is running at http://127.0.0.1:{port}")
    app.run(host="0.0.0.0", port=port, debug=False)
