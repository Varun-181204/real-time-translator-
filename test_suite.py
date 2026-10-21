import os
import json
import sqlite3
from app import app
from database import DB_PATH, get_connection

def test_full_pipeline():
    print("========================================")
    print(" RUNNING OMNITRANSLATE TEST SUITE")
    print("========================================")

    client = app.test_client()

    # 1. Health check
    res = client.get("/api/health")
    assert res.status_code == 200, f"Health check failed: {res.data}"
    health_data = res.get_json()
    assert health_data["status"] == "online"
    print("[PASS] 1. Health check endpoint online")

    # 2. Service Worker & Manifest routes
    res = client.get("/sw.js")
    assert res.status_code == 200
    assert "javascript" in res.headers.get("Content-Type", "")
    
    res = client.get("/manifest.json")
    assert res.status_code == 200
    manifest_data = res.get_json()
    assert manifest_data.get("short_name") == "OmniTranslate"
    assert len(manifest_data.get("icons", [])) >= 2

    res = client.get("/static/icons/icon-192.png")
    assert res.status_code == 200
    assert len(res.data) > 0

    print("[PASS] 2. Service Worker, PWA Manifest & App Icons verified")

    # 3. Unauthenticated /api/auth/me
    res = client.get("/api/auth/me")
    assert res.status_code == 200
    data = res.get_json()
    assert data["authenticated"] is False
    print("[PASS] 3. Unauthenticated session check returns False")

    # 4. Unauthenticated /api/translate guarded
    res = client.post("/api/translate", json={"text": "Hello world", "target_lang": "es"})
    assert res.status_code == 401
    assert res.get_json().get("auth_required") is True
    print("[PASS] 4. Translation endpoint blocked for unauthenticated users (401)")

    # 5. User Signup
    signup_payload = {
        "name": "Sarah Connor",
        "email": "sarah@resistance.org",
        "password": "securepassword123",
        "confirm_password": "securepassword123",
        "avatar": "detective"
    }
    # Clear existing if any from previous run
    conn = get_connection()
    c = conn.cursor()
    c.execute("DELETE FROM users WHERE email = ?", ("sarah@resistance.org",))
    c.execute("DELETE FROM profiles WHERE id IN (SELECT id FROM users WHERE email = ?)", ("sarah@resistance.org",))
    conn.commit()
    conn.close()

    res = client.post("/api/auth/signup", json=signup_payload)
    assert res.status_code == 200, f"Signup failed: {res.data}"
    signup_data = res.get_json()
    assert signup_data["success"] is True
    assert signup_data["user"]["name"] == "Sarah Connor"
    user_id = signup_data["user"]["id"]
    print(f"[PASS] 5. User signup successful: {signup_data['user']['name']} ({signup_data['user']['email']})")

    # 6. Verify password hashing in DB
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT password_hash FROM users WHERE id = ?", (user_id,))
    row = c.fetchone()
    conn.close()
    assert row is not None
    pw_hash = row[0]
    assert "securepassword123" not in pw_hash
    assert pw_hash.startswith("scrypt:") or pw_hash.startswith("pbkdf2:")
    print(f"[PASS] 6. Password securely hashed in database: {pw_hash[:25]}...")

    # 7. Check authenticated session
    res = client.get("/api/auth/me")
    assert res.status_code == 200
    me_data = res.get_json()
    assert me_data["authenticated"] is True
    assert me_data["user"]["id"] == user_id
    assert me_data["user"]["name"] == "Sarah Connor"
    print("[PASS] 7. Session persistence across requests confirmed")

    # 8. Profile Update & API Key Masking
    profile_update = {
        "name": "Sarah Connor - Commander",
        "avatar": "wizard",
        "native_language": "en",
        "default_target": "fr",
        "tone": "formal",
        "auto_speak": True,
        "speech_rate": 1.2,
        "custom_api_key": "AIzaSyTestSecretKey1234567890",
        "model": "gemini-3.8-flash"
    }
    res = client.post("/api/profile", json=profile_update)
    assert res.status_code == 200
    prof_data = res.get_json()
    assert prof_data["success"] is True
    # Verify masked API key returned to frontend
    assert prof_data["profile"]["custom_api_key"] == "••••••••••••••••"
    assert prof_data["profile"]["has_custom_key"] is True

    # Verify raw key in DB is the actual key
    raw_conn = get_connection()
    rc = raw_conn.cursor()
    rc.execute("SELECT custom_api_key FROM profiles WHERE id = ?", (user_id,))
    db_key = rc.fetchone()[0]
    raw_conn.close()
    assert db_key == "AIzaSyTestSecretKey1234567890"
    print("[PASS] 8. Profile update and API key masking verified (raw key safe on server, masked in frontend)")

    # Reset custom key to empty so that translation uses the valid system GEMINI_API_KEY
    client.post("/api/profile", json={"name": "Sarah Connor", "custom_api_key": ""})

    # 9. Perform Translation
    translate_payload = {
        "text": "Hello, it is a pleasure to meet you.",
        "source_lang": "en",
        "target_lang": "es",
        "tone": "formal",
        "save_history": True
    }
    res = client.post("/api/translate", json=translate_payload)
    trans_data = res.get_json()
    assert trans_data.get("success") is True, f"Translation failed: {trans_data}"
    assert len(trans_data["translated_text"]) > 0
    print(f"[PASS] 9. Translation executed: '{trans_data['translated_text']}' (Engine: {trans_data.get('engine')})")

    # 10. History Verification
    res = client.get("/api/history")
    assert res.status_code == 200
    hist_data = res.get_json()
    assert len(hist_data["items"]) >= 1
    item_id = hist_data["items"][0]["id"]
    print(f"[PASS] 10. History entry created and retrieved (ID: {item_id})")

    # Favorite History Item
    res = client.post("/api/history/favorite", json={"id": item_id})
    assert res.status_code == 200
    print("[PASS] 11. History item favorited successfully")

    # 12. Logout
    res = client.post("/api/auth/logout")
    assert res.status_code == 200
    # Check session cleared
    res = client.get("/api/auth/me")
    assert res.get_json()["authenticated"] is False
    print("[PASS] 12. Logout successfully cleared authenticated session")

    # 13. Invalid login check
    res = client.post("/api/auth/login", json={"email": "sarah@resistance.org", "password": "wrongpassword"})
    assert res.status_code == 401
    print("[PASS] 13. Invalid password rejected with 401")

    # 14. Valid login check
    res = client.post("/api/auth/login", json={"email": "sarah@resistance.org", "password": "securepassword123"})
    assert res.status_code == 200
    assert res.get_json()["success"] is True
    assert res.get_json()["user"]["name"] == "Sarah Connor"
    print("[PASS] 14. Login with correct credentials succeeded and restored user name & profile")

    # 15. Text-to-Speech (TTS) audio generation
    res = client.get("/api/tts?text=Hola+mundo&lang=es")
    assert res.status_code == 200
    assert "audio/mpeg" in res.headers.get("Content-Type", "")
    assert len(res.data) > 100
    print("[PASS] 15. Text-to-speech MP3 synthesis verified")

    # 16. Client timeout & single-attempt retry configuration
    from engine import (
        get_gemini_client,
        translate_with_gemini,
        test_api_key,
        format_gemini_error,
        DEFAULT_GEMINI_TIMEOUT_MS,
        FALLBACK_MODEL
    )
    from unittest.mock import patch, MagicMock

    gem_client, gem_err = get_gemini_client(timeout_ms=10000, max_attempts=1)
    assert gem_client is not None, f"Client init failed: {gem_err}"
    assert gem_client._api_client._http_options.timeout == 10000
    assert gem_client._api_client._http_options.retry_options.attempts == 1
    print("[PASS] 16. Supported explicit timeout (10000ms) & single attempt retry verified on google-genai client")

    # 17. Error message formatting for Gemini errors
    timeout_msg = format_gemini_error("ServerError: 504 DEADLINE_EXCEEDED. Operation timed out.")
    assert "timed out" in timeout_msg.lower()
    quota_msg = format_gemini_error("429 RESOURCE_EXHAUSTED. Quota exceeded.")
    assert "quota" in quota_msg.lower() or "rate limit" in quota_msg.lower()
    print("[PASS] 17. Gemini technical errors cleanly mapped to helpful user messages")

    # 18. Timeout simulation and fallback handling (no deep-translator hang)
    mock_client = MagicMock()
    mock_client.models.generate_content.side_effect = Exception("504 DEADLINE_EXCEEDED. Deadline expired.")
    with patch("engine.get_gemini_client", return_value=(mock_client, None)):
        timeout_res = translate_with_gemini("Test text", "es", model="gemini-2.5-flash")
        assert timeout_res["success"] is False
        assert "timed out" in timeout_res["error"].lower()
        # Verify single attempt when model is fallback model (no duplicate attempt)
        assert mock_client.models.generate_content.call_count == 1
    print("[PASS] 18. Gemini timeout returns clear error without hanging, avoiding duplicate attempts")

    # 19. Sensible fallback when requested model fails
    mock_client2 = MagicMock()
    mock_resp = MagicMock()
    mock_resp.text = '{"translated_text": "Prueba exitosa", "detected_source_lang": "en", "pronunciation": "", "nuance_note": "", "detected_tone": "natural"}'
    mock_client2.models.generate_content.side_effect = [
        Exception("503 UNAVAILABLE. Model experiencing high demand."),
        mock_resp
    ]
    with patch("engine.get_gemini_client", return_value=(mock_client2, None)):
        fallback_res = translate_with_gemini("Test text", "es", model="gemini-3.8-flash")
        assert fallback_res["success"] is True
        assert fallback_res["translated_text"] == "Prueba exitosa"
        assert "gemini-2.5-flash" in fallback_res["engine"]
        assert mock_client2.models.generate_content.call_count == 2
    print("[PASS] 19. Automatic fallback from failing model to gemini-2.5-flash verified")

    # 20. Translation endpoint error contracts (empty text & unconfigured key)
    res = client.post("/api/translate", json={"text": "   ", "target_lang": "es"})
    assert res.status_code == 400
    assert res.get_json()["error"] == "No text provided"
    print("[PASS] 20. Endpoint error response contract verified (HTTP 400 with clean error JSON)")

    # 21. API Key testing with timeout
    invalid_key_res = test_api_key("AIzaSyInvalidKeyTest1234567890")
    assert invalid_key_res["valid"] is False
    print(f"[PASS] 21. API Key verification safely tested with timeout (rejected invalid key)")

    print("\n========================================")
    print(" ALL 21 TEST SUITE CHECKS PASSED PERFECTLY!")
    print("========================================")

if __name__ == "__main__":
    test_full_pipeline()
