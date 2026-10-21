from datetime import datetime, timezone
import os
import re
import uuid

from pymongo import MongoClient, ReturnDocument
from pymongo.errors import DuplicateKeyError
from werkzeug.security import generate_password_hash, check_password_hash
from config import DEFAULT_PROFILE


_client = None


def get_database():
    """Return the configured MongoDB database."""
    global _client

    uri = os.environ.get("MONGODB_URI", "").strip()
    if not uri:
        raise RuntimeError("MONGODB_URI is not configured.")

    if _client is None:
        _client = MongoClient(uri, serverSelectionTimeoutMS=8000)

    return _client[os.environ.get("MONGODB_DB_NAME", "omnitranslate")]


def init_db():
    """Initialize indexes and the default profile."""
    db = get_database()
    db.command("ping")

    db.users.create_index("email", unique=True)
    db.users.create_index("id", unique=True)
    db.profiles.create_index("id", unique=True)
    db.history.create_index("id", unique=True)
    db.history.create_index([("profile_id", 1), ("timestamp", -1)])

    profile = dict(DEFAULT_PROFILE)
    profile.update({
        "id": "default",
        "auto_speak": bool(profile.get("auto_speak", True)),
        "custom_api_key": profile.get("custom_api_key", ""),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })
    db.profiles.update_one(
        {"id": "default"},
        {"$setOnInsert": profile},
        upsert=True,
    )


def create_user(email: str, password: str, name: str, avatar: str = "astronaut"):
    email_clean = (email or "").strip().lower()
    name_clean = (name or "").strip()

    if not email_clean or "@" not in email_clean:
        raise ValueError("A valid email address is required.")
    if len(password or "") < 6:
        raise ValueError("Password must be at least 6 characters long.")
    if not name_clean:
        name_clean = email_clean.split("@")[0].capitalize()

    db = get_database()
    user_id = str(uuid.uuid4())[:12]
    user = {
        "id": user_id,
        "email": email_clean,
        "password_hash": generate_password_hash(password),
        "name": name_clean,
        "avatar": avatar,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        db.users.insert_one(user)
    except DuplicateKeyError:
        raise ValueError("An account with this email already exists.")

    defaults = DEFAULT_PROFILE
    db.profiles.update_one(
        {"id": user_id},
        {"$set": {
            "id": user_id,
            "name": name_clean,
            "avatar": avatar,
            "native_language": defaults.get("native_language", "en"),
            "default_target": defaults.get("default_target", "es"),
            "tone": defaults.get("tone", "natural"),
            "auto_speak": bool(defaults.get("auto_speak", True)),
            "speech_rate": defaults.get("speech_rate", 1.0),
            "model": defaults.get("model", "gemini-3.8-flash"),
            "custom_api_key": "",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )

    return {
        "id": user_id,
        "email": email_clean,
        "name": name_clean,
        "avatar": avatar,
    }


def authenticate_user(email: str, password: str):
    db = get_database()
    row = db.users.find_one({"email": (email or "").strip().lower()})
    if not row or not check_password_hash(row["password_hash"], password or ""):
        return None

    return {
        "id": row["id"],
        "email": row["email"],
        "name": row["name"],
        "avatar": row.get("avatar", "astronaut"),
    }


def get_user_by_id(user_id: str):
    if not user_id:
        return None
    row = get_database().users.find_one(
        {"id": user_id},
        {"_id": 0, "id": 1, "email": 1, "name": 1, "avatar": 1, "created_at": 1},
    )
    return row


def get_raw_custom_api_key(profile_id: str) -> str:
    if not profile_id:
        return ""
    row = get_database().profiles.find_one(
        {"id": profile_id}, {"_id": 0, "custom_api_key": 1}
    )
    return (row.get("custom_api_key") or "").strip() if row else ""


def get_profile(profile_id="default"):
    row = get_database().profiles.find_one({"id": profile_id}, {"_id": 0})
    if not row:
        row = dict(DEFAULT_PROFILE)
        row["id"] = profile_id
        row["has_custom_key"] = False
        row["custom_api_key"] = ""
        return row

    raw_key = (row.get("custom_api_key") or "").strip()
    row["has_custom_key"] = bool(raw_key)
    row["custom_api_key"] = "????????????????????????????????????????????????" if raw_key else ""
    row["auto_speak"] = bool(row.get("auto_speak", True))
    return row


def save_profile(data, profile_id="default"):
    db = get_database()
    existing_key = get_raw_custom_api_key(profile_id)
    supplied_key = (data.get("custom_api_key") or "").strip()

    if "???" in supplied_key or "????????????" in supplied_key:
        final_key = existing_key
    else:
        final_key = supplied_key

    defaults = DEFAULT_PROFILE
    profile = {
        "id": profile_id,
        "name": data.get("name", defaults["name"]),
        "avatar": data.get("avatar", defaults["avatar"]),
        "native_language": data.get("native_language", defaults["native_language"]),
        "default_target": data.get("default_target", defaults["default_target"]),
        "tone": data.get("tone", defaults["tone"]),
        "auto_speak": bool(data.get("auto_speak", True)),
        "speech_rate": float(data.get("speech_rate", 1.0)),
        "model": data.get("model", defaults["model"]),
        "custom_api_key": final_key,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    db.profiles.update_one({"id": profile_id}, {"$set": profile}, upsert=True)
    db.users.update_one(
        {"id": profile_id},
        {"$set": {"name": profile["name"], "avatar": profile["avatar"]}},
    )
    return get_profile(profile_id)


def add_history(
    source_lang, target_lang, source_text, translated_text,
    pronunciation="", notes="", tone="natural", engine="gemini",
    profile_id="default",
):
    db = get_database()
    counter = db.counters.find_one_and_update(
        {"_id": "history_id"},
        {"$inc": {"value": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    history_id = counter["value"]

    db.history.insert_one({
        "id": history_id,
        "profile_id": profile_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "source_lang": source_lang,
        "target_lang": target_lang,
        "source_text": source_text,
        "translated_text": translated_text,
        "pronunciation": pronunciation,
        "notes": notes,
        "tone": tone,
        "engine": engine,
        "is_favorite": False,
    })
    return history_id


def get_history(limit=100, query=None, favorites_only=False, profile_id="default"):
    filters = {"profile_id": profile_id}
    if favorites_only:
        filters["is_favorite"] = True
    if query:
        pattern = re.escape(query)
        filters["$or"] = [
            {"source_text": {"$regex": pattern, "$options": "i"}},
            {"translated_text": {"$regex": pattern, "$options": "i"}},
        ]

    rows = get_database().history.find(
        filters, {"_id": 0}
    ).sort("timestamp", -1).limit(max(0, int(limit)))

    results = []
    for row in rows:
        row["is_favorite"] = bool(row.get("is_favorite", False))
        results.append(row)
    return results


def toggle_favorite(history_id, profile_id=None):
    db = get_database()
    filters = {"id": int(history_id)}
    if profile_id:
        filters["profile_id"] = profile_id

    row = db.history.find_one(filters, {"_id": 0, "is_favorite": 1})
    if row is None:
        return False

    new_value = not bool(row.get("is_favorite", False))
    db.history.update_one(filters, {"$set": {"is_favorite": new_value}})
    return new_value


def delete_history_item(history_id, profile_id=None):
    filters = {"id": int(history_id)}
    if profile_id:
        filters["profile_id"] = profile_id
    get_database().history.delete_one(filters)
    return True


def clear_all_history(profile_id="default", only_non_favorites=False):
    filters = {"profile_id": profile_id}
    if only_non_favorites:
        filters["is_favorite"] = False
    get_database().history.delete_many(filters)
    return True
