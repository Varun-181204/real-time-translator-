import os
import sys
import io
import csv
import json
import tempfile
from flask import Flask, render_template, request, jsonify, send_file, Response
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
    AVAILABLE_MODELS,
    TRANSLATION_TONES,
    SUPPORTED_LANGUAGES,
    DEFAULT_PROFILE,
)
from database import (
    init_db,
    get_profile,
    save_profile,
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
app.config["SECRET_KEY"] = os.urandom(24)

# Initialize database
init_db()

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/config", methods=["GET"])
def get_app_config():
    env_key_present = bool(os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY"))
    profile = get_profile("default")
    return jsonify({
        "languages": SUPPORTED_LANGUAGES,
        "tones": TRANSLATION_TONES,
        "models": AVAILABLE_MODELS,
        "env_key_present": env_key_present,
        "profile": profile,
    })

@app.route("/api/translate", methods=["POST"])
def translate_text():
    data = request.get_json(force=True, silent=True) or {}
    text = (data.get("text") or "").strip()
    if not text:
        return jsonify({"success": False, "error": "No text provided"}), 400

    target_lang = data.get("target_lang", "es")
    source_lang = data.get("source_lang", "auto")
    tone = data.get("tone", "natural")
    model = data.get("model", "gemini-3.8-flash")
    custom_api_key = data.get("custom_api_key") or None
    save_to_history = data.get("save_history", True)

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
            profile_id="default",
        )

    result["history_id"] = history_id
    return jsonify(result)

@app.route("/api/test-key", methods=["POST"])
def verify_key():
    data = request.get_json(force=True, silent=True) or {}
    api_key = data.get("api_key", "").strip()
    res = test_api_key(api_key)
    return jsonify(res)

@app.route("/api/profile", methods=["GET", "POST"])
def profile_handler():
    if request.method == "POST":
        data = request.get_json(force=True, silent=True) or {}
        updated = save_profile(data, "default")
        return jsonify({"success": True, "profile": updated})
    else:
        profile = get_profile("default")
        return jsonify(profile)

@app.route("/api/history", methods=["GET", "DELETE"])
def history_handler():
    if request.method == "DELETE":
        item_id = request.args.get("id")
        if item_id:
            delete_history_item(int(item_id))
            return jsonify({"success": True, "message": f"Deleted item {item_id}"})
        else:
            only_non_favs = request.args.get("keep_favorites", "false").lower() == "true"
            clear_all_history("default", only_non_favorites=only_non_favs)
            return jsonify({"success": True, "message": "History cleared"})

    query = request.args.get("query")
    favorites_only = request.args.get("favorites_only", "false").lower() == "true"
    limit = int(request.args.get("limit", 100))
    items = get_history(limit=limit, query=query, favorites_only=favorites_only)
    return jsonify({"items": items})

@app.route("/api/history/favorite", methods=["POST"])
def toggle_fav():
    data = request.get_json(force=True, silent=True) or {}
    history_id = data.get("id")
    if not history_id:
        return jsonify({"success": False, "error": "History ID required"}), 400
    is_fav = toggle_favorite(int(history_id))
    return jsonify({"success": True, "is_favorite": is_fav})

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
    """Transcribes uploaded audio files via speech recognition."""
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
    fmt = request.args.get("format", "json").lower()
    items = get_history(limit=500, favorites_only=False)

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
    print(f"🌟 Real-Time AI Translator is running at http://127.0.0.1:{port}")
    app.run(host="0.0.0.0", port=port, debug=False)
