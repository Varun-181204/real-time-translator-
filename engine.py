import os
import re
import json
import logging
import tempfile
from typing import Dict, Any, Optional
from google import genai
from google.genai import types
from config import TRANSLATION_TONES, SUPPORTED_LANGUAGES

logger = logging.getLogger("omnitranslate.engine")

# Explicit supported timeout: 15,000 milliseconds (15 seconds)
DEFAULT_GEMINI_TIMEOUT_MS = int(os.environ.get("GEMINI_TIMEOUT_MS", 15000))
PRIMARY_MODEL = "gemini-3.8-flash"
FALLBACK_MODEL = "gemini-3.6-flash"
TERTIARY_MODEL = "gemini-2.5-flash"

def format_gemini_error(error_str: str) -> str:
    """Formats Gemini API errors into helpful user-facing messages."""
    if not error_str:
        return "Translation failed: No response received from translation engine."
    err_lower = error_str.lower()
    if "deadline_exceeded" in err_lower or "timed out" in err_lower or "timeout" in err_lower:
        return "Translation request timed out. The AI model took too long to respond. Please try again."
    if any(k in err_lower for k in ("resource_exhausted", "429", "quota", "rate limit", "ratelimiterror", "too_many_requests")):
        return "Gemini API rate limit or quota exceeded. Please try again in a moment or add a custom API key in Profile."
    if "unavailable" in err_lower or "503" in err_lower or "experiencing high demand" in err_lower:
        return "Gemini AI model is temporarily experiencing high demand. Please try again shortly."
    if "api_key_invalid" in err_lower or "api key not valid" in err_lower or "invalid api key" in err_lower or "badrequesterror" in err_lower:
        return "Invalid Gemini API key. Please check your API key in Profile settings."
    if "permission_denied" in err_lower or "403" in err_lower:
        return "Access denied for Gemini API. Please check your API key permissions."
    if "no longer available" in err_lower or "not available to new users" in err_lower:
        return "Selected Gemini model is no longer available. OmniTranslate has been upgraded to gemini-3.8-flash."
    # Extract clean message if present in API error payload
    try:
        match = re.search(r"'(?:message|error)':\s*'([^']+)'", error_str)
        if match:
            return f"Gemini error: {match.group(1)}"
    except Exception:
        pass
    clean = error_str.strip()
    if len(clean) > 200:
        clean = clean[:200] + "..."
    return f"Translation error: {clean}"

def get_gemini_client(
    custom_api_key: Optional[str] = None,
    timeout_ms: int = DEFAULT_GEMINI_TIMEOUT_MS,
    max_attempts: int = 1
):
    """Obtains a Gemini Client with explicit HTTP timeout and retry options."""
    key = custom_api_key or os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not key:
        return None, "No API key configured"
    try:
        http_options = types.HttpOptions(
            timeout=timeout_ms,
            retry_options=types.HttpRetryOptions(attempts=max_attempts)
        )
        client = genai.Client(api_key=key.strip(), http_options=http_options)
        # Disable Speakeasy internal retry loops that hang on 429/503 errors
        if hasattr(client, "interactions") and client.interactions:
            try:
                client.interactions.sdk_configuration.retry_config = None
            except Exception:
                pass
        return client, None
    except Exception as e:
        return None, str(e)

def test_api_key(api_key: str) -> Dict[str, Any]:
    """Tests if a provided Gemini API key is valid using a fast, bounded check."""
    if not api_key or not api_key.strip():
        # Check if environment key exists
        env_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        if env_key:
            return {"valid": True, "source": "environment", "message": "Using system GEMINI_API_KEY"}
        return {"valid": False, "source": "none", "message": "No API key provided"}
    
    client, err = get_gemini_client(api_key.strip(), timeout_ms=5000, max_attempts=1)
    if not client:
        return {"valid": False, "source": "custom", "message": f"Initialization failed: {err}"}

    try:
        # Use Interactions API when available, otherwise generate_content
        if hasattr(client, "interactions") and client.interactions:
            inter = client.interactions.create(
                model=PRIMARY_MODEL,
                input="Say 'OK'",
                timeout=5.0
            )
            if inter and getattr(inter, "output_text", None):
                return {"valid": True, "source": "custom", "message": "API Key is valid and active!"}
        else:
            resp = client.models.generate_content(
                model=PRIMARY_MODEL,
                contents="Say 'OK'",
                config=types.GenerateContentConfig(
                    http_options=types.HttpOptions(timeout=5000, retry_options=types.HttpRetryOptions(attempts=1))
                )
            )
            if resp and resp.text:
                return {"valid": True, "source": "custom", "message": "API Key is valid and active!"}
        return {"valid": False, "source": "custom", "message": "Received empty response from API"}
    except Exception as e:
        return {"valid": False, "source": "custom", "message": f"Validation failed: {format_gemini_error(str(e))}"}

def translate_with_gemini(
    text: str,
    target_lang: str,
    source_lang: str = "auto",
    tone: str = "natural",
    model: str = "gemini-3.8-flash",
    custom_api_key: Optional[str] = None
) -> Dict[str, Any]:
    """Translates text using Gemini with intelligent context, pronunciation, and nuance."""
    client, err = get_gemini_client(custom_api_key, timeout_ms=DEFAULT_GEMINI_TIMEOUT_MS, max_attempts=1)
    if not client:
        return {
            "success": False,
            "translated_text": "",
            "detected_source_lang": source_lang,
            "pronunciation": "",
            "nuance_note": "",
            "engine": "Gemini",
            "tone": tone,
            "error": "Gemini API key is not configured. Please add an API key in Profile settings."
        }

    # Automatically upgrade any deprecated/stale model IDs
    if model in ("gemini-2.0-flash", "gemini-1.5-flash", "gemini-3.5-flash", "gemini-flash-latest", None, ""):
        model = PRIMARY_MODEL

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

    # Primary model first, followed by sensible fallbacks
    models_to_try = [model]
    if FALLBACK_MODEL not in models_to_try:
        models_to_try.append(FALLBACK_MODEL)
    if TERTIARY_MODEL not in models_to_try:
        models_to_try.append(TERTIARY_MODEL)

    timeout_sec = float(DEFAULT_GEMINI_TIMEOUT_MS) / 1000.0

    last_error = None
    for m in models_to_try:
        try:
            raw = ""
            # Migrate to Interactions API if available
            if hasattr(client, "interactions") and client.interactions:
                interaction = client.interactions.create(
                    model=m,
                    input=prompt,
                    response_format={
                        "type": "text",
                        "mime_type": "application/json",
                        "schema": {
                            "type": "object",
                            "properties": {
                                "translated_text": {"type": "string"},
                                "detected_source_lang": {"type": "string"},
                                "pronunciation": {"type": "string"},
                                "nuance_note": {"type": "string"},
                                "detected_tone": {"type": "string"}
                            },
                            "required": ["translated_text"]
                        }
                    },
                    timeout=timeout_sec
                )
                raw = (getattr(interaction, "output_text", "") or "").strip()
            else:
                gen_config = types.GenerateContentConfig(
                    http_options=types.HttpOptions(
                        timeout=DEFAULT_GEMINI_TIMEOUT_MS,
                        retry_options=types.HttpRetryOptions(attempts=1)
                    ),
                    response_mime_type="application/json"
                )
                response = client.models.generate_content(
                    model=m,
                    contents=prompt,
                    config=gen_config
                )
                raw = response.text.strip() if response and response.text else ""

            # Clean markdown code fences if present
            if raw.startswith("```json"):
                raw = raw[7:]
            elif raw.startswith("```"):
                raw = raw[3:]
            if raw.endswith("```"):
                raw = raw[:-3]
            raw = raw.strip()

            # Ensure valid JSON object extraction
            data = None
            if raw.startswith("{") and raw.endswith("}"):
                try:
                    data = json.loads(raw)
                except Exception:
                    data = None

            if data is None:
                start_idx = raw.find("{")
                end_idx = raw.rfind("}")
                if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
                    try:
                        data = json.loads(raw[start_idx:end_idx + 1])
                    except Exception:
                        data = None

            if data is None and raw:
                # If model returned direct translated text rather than JSON
                data = {
                    "translated_text": raw,
                    "detected_source_lang": source_lang,
                    "pronunciation": "",
                    "nuance_note": "",
                    "detected_tone": tone
                }

            if not data or not data.get("translated_text"):
                raise ValueError("Model returned empty translation")

            logger.info("Translation succeeded with model: %s (engine: Gemini (%s), tone: %s)", m, m, tone)
            return {
                "success": True,
                "translated_text": str(data.get("translated_text", "")).strip(),
                "detected_source_lang": data.get("detected_source_lang", source_lang),
                "pronunciation": str(data.get("pronunciation", "")).strip(),
                "nuance_note": str(data.get("nuance_note", "")).strip(),
                "engine": f"Gemini ({m})",
                "tone": tone
            }
        except Exception as e:
            last_error = str(e)
            logger.warning("Translation attempt with model %s failed: %s", m, format_gemini_error(str(e)))
            err_lower = str(e).lower()
            # If the request timed out, do not hang the user with subsequent attempts
            if any(k in err_lower for k in ("deadline_exceeded", "timed out", "timeout")):
                break
            continue

    # If Gemini failed across all attempts, return a clear, useful error without hanging
    return {
        "success": False,
        "translated_text": "",
        "detected_source_lang": source_lang,
        "pronunciation": "",
        "nuance_note": "",
        "engine": "Gemini",
        "tone": tone,
        "error": format_gemini_error(last_error or "Unknown error")
    }

def translate_fallback(text: str, target_lang: str, source_lang: str = "auto", error_note: str = "") -> Dict[str, Any]:
    """Fallback translator stub - removed from critical path to prevent hanging requests."""
    return {
        "success": False,
        "translated_text": "",
        "detected_source_lang": source_lang,
        "pronunciation": "",
        "nuance_note": "",
        "engine": "None",
        "tone": "natural",
        "error": error_note or "Fallback translation service is disabled to prevent hanging requests. Please verify your Gemini API key."
    }

def text_to_speech_mp3(text: str, lang: str = "en") -> Optional[bytes]:
    """Converts text to MP3 bytes using gTTS."""
    try:
        from gtts import gTTS
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
