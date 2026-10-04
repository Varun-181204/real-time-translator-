import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "translator_data.db")

# Supported models
AVAILABLE_MODELS = [
    {"id": "gemini-3.8-flash", "name": "Gemini 3.8 Flash (Fast & Smart - Recommended)", "default": True},
    {"id": "gemini-2.5-flash", "name": "Gemini 2.5 Flash (Reliable)", "default": False},
]

# Translation Tones / Personas
TRANSLATION_TONES = [
    {
        "id": "natural",
        "name": "Natural & Fluent",
        "icon": "sparkles",
        "instruction": "Translate naturally and fluently preserving original intent and emotional tone.",
    },
    {
        "id": "formal",
        "name": "Formal & Business",
        "icon": "briefcase",
        "instruction": "Translate with a polite, professional, and respectful tone suitable for business or formal communication.",
    },
    {
        "id": "casual",
        "name": "Casual & Conversational",
        "icon": "message-circle",
        "instruction": "Translate in a warm, relaxed, colloquial conversational tone like speaking to a friend.",
    },
    {
        "id": "traveler",
        "name": "Traveler & Tourist",
        "icon": "compass",
        "instruction": "Translate clearly with practical, polite phrasing commonly used by travelers in restaurants, directions, or transit.",
    },
    {
        "id": "slang",
        "name": "Youth / Slang / Idiomatic",
        "icon": "zap",
        "instruction": "Translate with contemporary idioms, expressive slang, and modern vernacular where appropriate.",
    },
    {
        "id": "simplified",
        "name": "Simple & Direct",
        "icon": "book-open",
        "instruction": "Translate in simple, short, clear sentences easy for language learners to comprehend.",
    },
]

# Supported Languages with ISO codes and Flags
SUPPORTED_LANGUAGES = [
    {"code": "auto", "name": "Auto Detect", "flag": "🌐"},
    {"code": "en", "name": "English", "flag": "🇬🇧", "speech_code": "en-US"},
    {"code": "es", "name": "Spanish", "flag": "🇪🇸", "speech_code": "es-ES"},
    {"code": "hi", "name": "Hindi", "flag": "🇮🇳", "speech_code": "hi-IN"},
    {"code": "fr", "name": "French", "flag": "🇫🇷", "speech_code": "fr-FR"},
    {"code": "de", "name": "German", "flag": "🇩🇪", "speech_code": "de-DE"},
    {"code": "ja", "name": "Japanese", "flag": "🇯🇵", "speech_code": "ja-JP"},
    {"code": "zh", "name": "Chinese (Simplified)", "flag": "🇨🇳", "speech_code": "zh-CN"},
    {"code": "ar", "name": "Arabic", "flag": "🇸🇦", "speech_code": "ar-SA"},
    {"code": "ru", "name": "Russian", "flag": "🇷🇺", "speech_code": "ru-RU"},
    {"code": "pt", "name": "Portuguese", "flag": "🇵🇹", "speech_code": "pt-PT"},
    {"code": "it", "name": "Italian", "flag": "🇮🇹", "speech_code": "it-IT"},
    {"code": "ko", "name": "Korean", "flag": "🇰🇷", "speech_code": "ko-KR"},
    {"code": "nl", "name": "Dutch", "flag": "🇳🇱", "speech_code": "nl-NL"},
    {"code": "tr", "name": "Turkish", "flag": "🇹🇷", "speech_code": "tr-TR"},
    {"code": "pl", "name": "Polish", "flag": "🇵🇱", "speech_code": "pl-PL"},
    {"code": "sv", "name": "Swedish", "flag": "🇸🇪", "speech_code": "sv-SE"},
    {"code": "id", "name": "Indonesian", "flag": "🇮🇩", "speech_code": "id-ID"},
    {"code": "vi", "name": "Vietnamese", "flag": "🇻🇳", "speech_code": "vi-VN"},
    {"code": "th", "name": "Thai", "flag": "🇹🇭", "speech_code": "th-TH"},
    {"code": "bn", "name": "Bengali", "flag": "🇧🇩", "speech_code": "bn-IN"},
    {"code": "te", "name": "Telugu", "flag": "🇮🇳", "speech_code": "te-IN"},
    {"code": "ta", "name": "Tamil", "flag": "🇮🇳", "speech_code": "ta-IN"},
    {"code": "mr", "name": "Marathi", "flag": "🇮🇳", "speech_code": "mr-IN"},
    {"code": "gu", "name": "Gujarati", "flag": "🇮🇳", "speech_code": "gu-IN"},
    {"code": "kn", "name": "Kannada", "flag": "🇮🇳", "speech_code": "kn-IN"},
    {"code": "ml", "name": "Malayalam", "flag": "🇮🇳", "speech_code": "ml-IN"},
    {"code": "pa", "name": "Punjabi", "flag": "🇮🇳", "speech_code": "pa-IN"},
    {"code": "ur", "name": "Urdu", "flag": "🇵🇰", "speech_code": "ur-PK"},
    {"code": "fa", "name": "Persian", "flag": "🇮🇷", "speech_code": "fa-IR"},
    {"code": "el", "name": "Greek", "flag": "🇬🇷", "speech_code": "el-GR"},
    {"code": "cs", "name": "Czech", "flag": "🇨🇿", "speech_code": "cs-CZ"},
    {"code": "ro", "name": "Romanian", "flag": "🇷🇴", "speech_code": "ro-RO"},
    {"code": "hu", "name": "Hungarian", "flag": "🇭🇺", "speech_code": "hu-HU"},
    {"code": "uk", "name": "Ukrainian", "flag": "🇺🇦", "speech_code": "uk-UA"},
    {"code": "he", "name": "Hebrew", "flag": "🇮🇱", "speech_code": "he-IL"},
    {"code": "da", "name": "Danish", "flag": "🇩🇰", "speech_code": "da-DK"},
    {"code": "fi", "name": "Finnish", "flag": "🇫🇮", "speech_code": "fi-FI"},
    {"code": "no", "name": "Norwegian", "flag": "🇳🇴", "speech_code": "nb-NO"},
    {"code": "ms", "name": "Malay", "flag": "🇲🇾", "speech_code": "ms-MY"},
    {"code": "tl", "name": "Filipino / Tagalog", "flag": "🇵🇭", "speech_code": "fil-PH"},
]

DEFAULT_PROFILE = {
    "name": "Cosmic Voyager",
    "avatar": "astronaut",
    "native_language": "en",
    "default_target": "es",
    "tone": "natural",
    "auto_speak": True,
    "speech_rate": 1.0,
    "model": "gemini-3.8-flash",
    "custom_api_key": "",
}
