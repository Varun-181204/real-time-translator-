import sqlite3
import json
import uuid
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
from config import DB_PATH, DEFAULT_PROFILE

def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_connection()
    cursor = conn.cursor()
    
    # Users table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        avatar TEXT DEFAULT 'astronaut',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    # Profiles table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        avatar TEXT DEFAULT 'astronaut',
        native_language TEXT DEFAULT 'en',
        default_target TEXT DEFAULT 'es',
        tone TEXT DEFAULT 'natural',
        auto_speak INTEGER DEFAULT 1,
        speech_rate REAL DEFAULT 1.0,
        model TEXT DEFAULT 'gemini-3.8-flash',
        custom_api_key TEXT DEFAULT '',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    # Translation history table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_id TEXT DEFAULT 'default',
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        source_lang TEXT,
        target_lang TEXT,
        source_text TEXT,
        translated_text TEXT,
        pronunciation TEXT DEFAULT '',
        notes TEXT DEFAULT '',
        tone TEXT DEFAULT 'natural',
        engine TEXT DEFAULT 'gemini',
        is_favorite INTEGER DEFAULT 0
    )
    """)
    
    # Ensure default profile exists for fallback
    cursor.execute("SELECT id FROM profiles WHERE id = 'default'")
    if not cursor.fetchone():
        cursor.execute("""
        INSERT INTO profiles (id, name, avatar, native_language, default_target, tone, auto_speak, speech_rate, model, custom_api_key)
        VALUES ('default', :name, :avatar, :native_language, :default_target, :tone, :auto_speak, :speech_rate, :model, :custom_api_key)
        """, DEFAULT_PROFILE)
    
    conn.commit()
    conn.close()

# -------------------------------------------------------------
# User Authentication & Management
# -------------------------------------------------------------
def create_user(email: str, password: str, name: str, avatar: str = 'astronaut'):
    """Creates a new user with securely hashed password and initializes their profile."""
    email_clean = email.strip().lower()
    name_clean = name.strip()
    
    if not email_clean or '@' not in email_clean:
        raise ValueError("A valid email address is required.")
    if len(password) < 6:
        raise ValueError("Password must be at least 6 characters long.")
    if not name_clean:
        name_clean = email_clean.split('@')[0].capitalize()
        
    conn = get_connection()
    cursor = conn.cursor()
    
    # Check if email already exists
    cursor.execute("SELECT id FROM users WHERE email = ?", (email_clean,))
    if cursor.fetchone():
        conn.close()
        raise ValueError("An account with this email already exists.")
        
    user_id = str(uuid.uuid4())[:12]
    pw_hash = generate_password_hash(password)
    
    cursor.execute("""
    INSERT INTO users (id, email, password_hash, name, avatar)
    VALUES (?, ?, ?, ?, ?)
    """, (user_id, email_clean, pw_hash, name_clean, avatar))
    
    # Initialize profile for this user
    cursor.execute("""
    INSERT INTO profiles (id, name, avatar, native_language, default_target, tone, auto_speak, speech_rate, model, custom_api_key)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        user_id,
        name_clean,
        avatar,
        DEFAULT_PROFILE.get("native_language", "en"),
        DEFAULT_PROFILE.get("default_target", "es"),
        DEFAULT_PROFILE.get("tone", "natural"),
        1 if DEFAULT_PROFILE.get("auto_speak", True) else 0,
        DEFAULT_PROFILE.get("speech_rate", 1.0),
        DEFAULT_PROFILE.get("model", "gemini-3.8-flash"),
        ""
    ))
    
    conn.commit()
    conn.close()
    
    return {
        "id": user_id,
        "email": email_clean,
        "name": name_clean,
        "avatar": avatar
    }

def authenticate_user(email: str, password: str):
    """Authenticates user by email and password, returning user info if valid."""
    email_clean = email.strip().lower()
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE email = ?", (email_clean,))
    row = cursor.fetchone()
    conn.close()
    
    if not row:
        return None
        
    user_dict = dict(row)
    if check_password_hash(user_dict["password_hash"], password):
        return {
            "id": user_dict["id"],
            "email": user_dict["email"],
            "name": user_dict["name"],
            "avatar": user_dict["avatar"]
        }
    return None

def get_user_by_id(user_id: str):
    """Fetches user information by ID without exposing password hash."""
    if not user_id:
        return None
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, email, name, avatar, created_at FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

# -------------------------------------------------------------
# Profile Management (With Secure API Key Masking)
# -------------------------------------------------------------
def get_raw_custom_api_key(profile_id: str) -> str:
    """Server-only helper to fetch the raw API key for Gemini execution."""
    if not profile_id:
        return ""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT custom_api_key FROM profiles WHERE id = ?", (profile_id,))
    row = cursor.fetchone()
    conn.close()
    return row[0].strip() if row and row[0] else ""

def get_profile(profile_id="default"):
    """Fetches profile, masking any personal API key for frontend security."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM profiles WHERE id = ?", (profile_id,))
    row = cursor.fetchone()
    conn.close()
    if row:
        d = dict(row)
        raw_key = (d.get("custom_api_key") or "").strip()
        d["has_custom_key"] = bool(raw_key)
        # Never expose raw key to the client
        d["custom_api_key"] = "••••••••••••••••" if raw_key else ""
        d["auto_speak"] = bool(d["auto_speak"])
        return d
    fallback = DEFAULT_PROFILE.copy()
    fallback["has_custom_key"] = False
    fallback["custom_api_key"] = ""
    return fallback

def save_profile(data, profile_id="default"):
    """Saves profile changes while preserving raw API keys if received masked."""
    existing_raw_key = get_raw_custom_api_key(profile_id)
    new_key_input = (data.get("custom_api_key") or "").strip()
    
    # If key contains mask bullets, do not overwrite the raw key
    if "•" in new_key_input or "••••" in new_key_input:
        final_key = existing_raw_key
    else:
        final_key = new_key_input
        
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO profiles (id, name, avatar, native_language, default_target, tone, auto_speak, speech_rate, model, custom_api_key, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        avatar = excluded.avatar,
        native_language = excluded.native_language,
        default_target = excluded.default_target,
        tone = excluded.tone,
        auto_speak = excluded.auto_speak,
        speech_rate = excluded.speech_rate,
        model = excluded.model,
        custom_api_key = excluded.custom_api_key,
        updated_at = CURRENT_TIMESTAMP
    """, (
        profile_id,
        data.get("name", DEFAULT_PROFILE["name"]),
        data.get("avatar", DEFAULT_PROFILE["avatar"]),
        data.get("native_language", DEFAULT_PROFILE["native_language"]),
        data.get("default_target", DEFAULT_PROFILE["default_target"]),
        data.get("tone", DEFAULT_PROFILE["tone"]),
        1 if data.get("auto_speak", True) else 0,
        float(data.get("speech_rate", 1.0)),
        data.get("model", DEFAULT_PROFILE["model"]),
        final_key,
    ))
    
    # Also keep users table in sync if user exists
    cursor.execute("""
    UPDATE users SET name = ?, avatar = ? WHERE id = ?
    """, (data.get("name", DEFAULT_PROFILE["name"]), data.get("avatar", DEFAULT_PROFILE["avatar"]), profile_id))
    
    conn.commit()
    conn.close()
    return get_profile(profile_id)

# -------------------------------------------------------------
# Translation History Management
# -------------------------------------------------------------
def add_history(source_lang, target_lang, source_text, translated_text, pronunciation="", notes="", tone="natural", engine="gemini", profile_id="default"):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO history (profile_id, source_lang, target_lang, source_text, translated_text, pronunciation, notes, tone, engine)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (profile_id, source_lang, target_lang, source_text, translated_text, pronunciation, notes, tone, engine))
    history_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return history_id

def get_history(limit=100, query=None, favorites_only=False, profile_id="default"):
    conn = get_connection()
    cursor = conn.cursor()
    sql = "SELECT * FROM history WHERE profile_id = ?"
    params = [profile_id]
    
    if favorites_only:
        sql += " AND is_favorite = 1"
        
    if query:
        sql += " AND (source_text LIKE ? OR translated_text LIKE ?)"
        params.extend([f"%{query}%", f"%{query}%"])
        
    sql += " ORDER BY timestamp DESC LIMIT ?"
    params.append(limit)
    
    cursor.execute(sql, params)
    rows = cursor.fetchall()
    conn.close()
    results = []
    for r in rows:
        item = dict(r)
        item['is_favorite'] = bool(item['is_favorite'])
        results.append(item)
    return results

def toggle_favorite(history_id, profile_id=None):
    conn = get_connection()
    cursor = conn.cursor()
    if profile_id:
        cursor.execute("UPDATE history SET is_favorite = 1 - is_favorite WHERE id = ? AND profile_id = ?", (history_id, profile_id))
    else:
        cursor.execute("UPDATE history SET is_favorite = 1 - is_favorite WHERE id = ?", (history_id,))
    cursor.execute("SELECT is_favorite FROM history WHERE id = ?", (history_id,))
    row = cursor.fetchone()
    conn.commit()
    conn.close()
    return bool(row[0]) if row else False

def delete_history_item(history_id, profile_id=None):
    conn = get_connection()
    cursor = conn.cursor()
    if profile_id:
        cursor.execute("DELETE FROM history WHERE id = ? AND profile_id = ?", (history_id, profile_id))
    else:
        cursor.execute("DELETE FROM history WHERE id = ?", (history_id,))
    conn.commit()
    conn.close()
    return True

def clear_all_history(profile_id="default", only_non_favorites=False):
    conn = get_connection()
    cursor = conn.cursor()
    if only_non_favorites:
        cursor.execute("DELETE FROM history WHERE profile_id = ? AND is_favorite = 0", (profile_id,))
    else:
        cursor.execute("DELETE FROM history WHERE profile_id = ?", (profile_id,))
    conn.commit()
    conn.close()
    return True
