import os
import json
import tempfile
from typing import Dict, Any, Optional
from google import genai
from config import TRANSLATION_TONES, SUPPORTED_LANGUAGES

def get_gemini_client(custom_api_key: Optional[str] = None):
    """Obtains a Gemini Client using custom key, or env variables."""
    key = custom_api_key or os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not key:
        return None, "No API key configured"
    try:
        client = genai.Client(api_key=key.strip())
        return client, None
    except Exception as e:
        return None, str(e)

def test_api_key(api_key: str) -> Dict[str, Any]:
    """Tests if a provided Gemini API key is valid."""
    if not api_key or not api_key.strip():
        # Check if environment key exists
        env_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        if env_key:
            return {"valid": True, "source": "environment", "message": "Using system GEMINI_API_KEY"}
        return {"valid": False, "source": "none", "message": "No API key provided"}
    
    try:
        client = genai.Client(api_key=api_key.strip())
        resp = client.models.generate_content(
            model="gemini-3.8-flash",
            contents="Say 'OK'"
        )
        if resp and resp.text:
            return {"valid": True, "source": "custom", "message": "API Key is valid and active!"}
        return {"valid": False, "source": "custom", "message": "Received empty response from API"}
    except Exception as e:
        # Try fallback to 2.5-flash
        try:
            client = genai.Client(api_key=api_key.strip())
            resp = client.models.generate_content(
                model="gemini-2.5-flash",
                contents="Say 'OK'"
            )
            if resp and resp.text:
                return {"valid": True, "source": "custom", "message": "API Key verified with gemini-2.5-flash!"}
        except Exception:
            pass
        return {"valid": False, "source": "custom", "message": f"Validation failed: {str(e)}"}

def translate_with_gemini(
    text: str,
    target_lang: str,
    source_lang: str = "auto",
    tone: str = "natural",
    model: str = "gemini-3.8-flash",
    custom_api_key: Optional[str] = None
) -> Dict[str, Any]:
    """Translates text using Gemini with intelligent context, pronunciation, and nuance."""
    client, err = get_gemini_client(custom_api_key)
    if not client:
        return translate_fallback(text, target_lang, source_lang, error_note="Gemini API key not configured")

    # Find tone instruction
    tone_instruction = "Translate naturally and accurately."
    for t in TRANSLATION_TONES:
        if t["id"] == tone:
            tone_instruction = t["instruction"]
            break

    # Prompt design for structured output
    prompt = f"""
You are a master real-time multilingual interpreter and linguistic expert.
Source language: {source_lang if source_lang != 'auto' else 'Detect automatically'}
Target language: {target_lang}
Tone/Persona instruction: {tone_instruction}

Text to translate:
\"\"\"{text}\"\"\"

Provide your response in strictly valid JSON format with the following keys:
{{
  "translated_text": "The final translated text",
  "detected_source_lang": "The 2-letter or name of the detected source language",
  "pronunciation": "Phonetic romanization or pronunciation guide (e.g. Romaji for Japanese, Pinyin for Chinese, Devanagari transliteration for Hindi, or IPA) if target language uses non-Latin script or has tricky pronunciation; otherwise empty string",
  "nuance_note": "A brief 1-sentence cultural, stylistic, or linguistic nuance note if helpful; otherwise empty string",
  "detected_tone": "{tone}"
}}
Do NOT wrap in markdown formatting or backticks if possible, return raw JSON.
"""

    # First attempt with requested model, fallback to gemini-2.5-flash if needed
    models_to_try = [model, "gemini-3.8-flash", "gemini-2.5-flash"]
    # Deduplicate while preserving order
    seen = set()
    models_to_try = [m for m in models_to_try if not (m in seen or seen.add(m))]

    last_error = None
    for m in models_to_try:
        try:
            response = client.models.generate_content(
                model=m,
                contents=prompt
            )
            raw = response.text.strip()
            # Clean up potential markdown code fences
            if raw.startswith("```json"):
                raw = raw[7:]
            elif raw.startswith("```"):
                raw = raw[3:]
            if raw.endswith("```"):
                raw = raw[:-3]
            raw = raw.strip()

            data = json.loads(raw)
            return {
                "success": True,
                "translated_text": data.get("translated_text", "").strip(),
                "detected_source_lang": data.get("detected_source_lang", source_lang),
                "pronunciation": data.get("pronunciation", "").strip(),
                "nuance_note": data.get("nuance_note", "").strip(),
                "engine": f"Gemini ({m})",
                "tone": tone
            }
        except Exception as e:
            last_error = str(e)
            continue

    # If Gemini failed across all attempts, fallback
    return translate_fallback(text, target_lang, source_lang, error_note=f"Gemini API error: {last_error}")

def translate_fallback(text: str, target_lang: str, source_lang: str = "auto", error_note: str = "") -> Dict[str, Any]:
    """Fallback translator using deep-translator or direct response."""
    try:
        from deep_translator import GoogleTranslator
        src = "auto" if source_lang == "auto" else source_lang
        tgt = target_lang
        # Simple map if code is like zh-CN
        if tgt.startswith("zh"):
            tgt = "zh-CN"
        translated = GoogleTranslator(source=src, target=tgt).translate(text)
        return {
            "success": True,
            "translated_text": translated,
            "detected_source_lang": source_lang,
            "pronunciation": "",
            "nuance_note": "Translated using standard web fallback." + (f" ({error_note})" if error_note else ""),
            "engine": "Fallback (Google Translator)",
            "tone": "natural"
        }
    except Exception as e:
        return {
            "success": False,
            "translated_text": "",
            "detected_source_lang": source_lang,
            "pronunciation": "",
            "nuance_note": f"Translation failed: {error_note or str(e)}",
            "engine": "None",
            "tone": "natural",
            "error": str(e)
        }

def text_to_speech_mp3(text: str, lang: str = "en") -> Optional[bytes]:
    """Converts text to MP3 bytes using gTTS."""
    try:
        from gTTS import gTTS
        # Clean lang code (e.g. en-US -> en)
        simple_lang = lang.split("-")[0] if "-" in lang else lang
        tts = gTTS(text=text, lang=simple_lang)
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as fp:
            temp_path = fp.name
            tts.save(temp_path)
            
        with open(temp_path, "rb") as f:
            audio_bytes = f.read()
            
        try:
            os.remove(temp_path)
        except OSError:
            pass
            
        return audio_bytes
    except Exception as e:
        print(f"TTS error: {e}")
        return None
