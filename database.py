import sqlite3
import json
from datetime import datetime
from config import DB_PATH, DEFAULT_PROFILE

def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_connection()
    cursor = conn.cursor()
    
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
    
    # Insert default profile if not exists
    cursor.execute("SELECT id FROM profiles WHERE id = 'default'")
    if not cursor.fetchone():
        cursor.execute("""
        INSERT INTO profiles (id, name, avatar, native_language, default_target, tone, auto_speak, speech_rate, model, custom_api_key)
        VALUES ('default', :name, :avatar, :native_language, :default_target, :tone, :auto_speak, :speech_rate, :model, :custom_api_key)
        """, DEFAULT_PROFILE)
    
    conn.commit()
    conn.close()

def get_profile(profile_id="default"):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM profiles WHERE id = ?", (profile_id,))
    row = cursor.fetchone()
    conn.close()
    if row:
        d = dict(row)
        d['auto_speak'] = bool(d['auto_speak'])
        return d
    return DEFAULT_PROFILE.copy()

def save_profile(data, profile_id="default"):
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
        data.get("custom_api_key", ""),
    ))
    conn.commit()
    conn.close()
    return get_profile(profile_id)

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

def toggle_favorite(history_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE history SET is_favorite = 1 - is_favorite WHERE id = ?", (history_id,))
    cursor.execute("SELECT is_favorite FROM history WHERE id = ?", (history_id,))
    row = cursor.fetchone()
    conn.commit()
    conn.close()
    return bool(row[0]) if row else False

def delete_history_item(history_id):
    conn = get_connection()
    cursor = conn.cursor()
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
