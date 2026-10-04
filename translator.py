"""
OmniTranslate AI - Real-Time Multilingual Speech & Text Translator (CLI & Engine)
Enhanced with Google Gemini 3.8 Flash, intelligent transliteration,
audio speech recognition, and fallback translation.
"""

import os
import sys
import tempfile
from typing import Optional

# Ensure utf-8 output encoding for terminals
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

from dotenv import load_dotenv
load_dotenv()

from engine import translate_with_gemini, text_to_speech_mp3
from database import add_history, init_db

# -----------------------------
# 🎧 STEP 1: Record Speech (CLI)
# -----------------------------
def listen(duration: int = 5, samplerate: int = 16000) -> str:
    """Records audio from microphone and returns recognized text."""
    try:
        import sounddevice as sd
        import soundfile as sf
        import speech_recognition as sr
        
        print(f"\n🎙️ Speak now (recording for {duration} seconds)...")
        audio_data = sd.rec(int(duration * samplerate), samplerate=samplerate, channels=1, dtype='int16')
        sd.wait()
        
        # Save temporary wav
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_wav:
            temp_path = temp_wav.name
            sf.write(temp_path, audio_data, samplerate)
        
        # Recognize speech
        recognizer = sr.Recognizer()
        with sr.AudioFile(temp_path) as source:
            audio = recognizer.record(source)
            try:
                text = recognizer.recognize_google(audio)
                print(f"🗣️ You said: \"{text}\"")
                return text
            except sr.UnknownValueError:
                print("❌ Could not understand audio.")
                return ""
            except sr.RequestError as e:
                print(f"⚠️ Speech recognition service error: {e}")
                return ""
        finally:
            try:
                os.remove(temp_path)
            except OSError:
                pass
    except ImportError as e:
        print(f"⚠️ Audio dependencies missing: {e}. Falling back to text input.")
        return input("Enter text to translate: ").strip()

# -----------------------------
# 🌍 STEP 2: Translate with Gemini / Fallback
# -----------------------------
def auto_translate(text: str, target_lang: str = "en", tone: str = "natural", source_lang: str = "auto"):
    """Translates text with smart cultural context and pronunciation."""
    if not text:
        return "", target_lang

    print(f"🔍 Translating to '{target_lang}' (Tone: {tone})...")
    res = translate_with_gemini(
        text=text,
        target_lang=target_lang,
        source_lang=source_lang,
        tone=tone,
        model="gemini-3.8-flash"
    )

    if res.get("success"):
        translated_text = res.get("translated_text", "")
        pronunciation = res.get("pronunciation", "")
        nuance = res.get("nuance_note", "")
        engine = res.get("engine", "Gemini")

        print(f"\n✅ Translation ({engine}): {translated_text}")
        if pronunciation:
            print(f"🔊 Pronunciation: {pronunciation}")
        if nuance:
            print(f"💡 Linguistic Note: {nuance}")

        # Save to database history
        try:
            init_db()
            add_history(
                source_lang=res.get("detected_source_lang", source_lang),
                target_lang=target_lang,
                source_text=text,
                translated_text=translated_text,
                pronunciation=pronunciation,
                notes=nuance,
                tone=tone,
                engine=engine
            )
        except Exception:
            pass

        return translated_text, target_lang
    else:
        print(f"❌ Translation failed: {res.get('error')}")
        return "", target_lang

# -----------------------------
# 🔊 STEP 3: Speak Translation
# -----------------------------
def speak(text: str, lang: str = "en"):
    """Plays translated audio aloud."""
    if not text:
        return
    
    audio_bytes = text_to_speech_mp3(text, lang=lang)
    if not audio_bytes:
        return

    with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as temp_mp3:
        temp_path = temp_mp3.name
        temp_mp3.write(audio_bytes)

    try:
        from playsound import playsound
        playsound(temp_path)
    except Exception:
        # Fallback to os startfile on Windows
        try:
            if sys.platform == "win32":
                os.startfile(temp_path)
        except Exception:
            pass
    finally:
        try:
            os.remove(temp_path)
        except OSError:
            pass

# -----------------------------
# 🚀 CLI MAIN INTERACTIVE LOOP
# -----------------------------
if __name__ == "__main__":
    init_db()
    print("=" * 60)
    print("🌟 OmniTranslate AI - Real-Time Multilingual Translator")
    print("=" * 60)
    print("Tip: For the Modern Web Studio UI with dynamic audio waves & profiles,")
    print("run: python app.py  (or run 'run.bat')")
    print("-" * 60)

    target_language = input("Enter target language code (e.g. es, fr, hi, ja, de, en) [default: es]: ").strip().lower() or "es"
    tone_choice = input("Enter tone (natural / formal / casual / traveler / slang) [default: natural]: ").strip().lower() or "natural"
    mode_choice = input("Input mode: [1] Speak into microphone, [2] Type text [default: 1]: ").strip() or "1"

    while True:
        if mode_choice == "2":
            spoken_text = input("\n📝 Enter text to translate (or 'exit' to quit): ").strip()
            if spoken_text.lower() in ("exit", "quit", "q"):
                break
        else:
            spoken_text = listen(duration=5)
            if not spoken_text:
                retry = input("No speech recognized. Try again? (y/n): ").lower()
                if retry != "y":
                    break
                continue

        translated_text, _ = auto_translate(spoken_text, target_lang=target_language, tone=tone_choice)
        if translated_text:
            speak(translated_text, lang=target_language)

        print("-" * 60)
        again = input("Translate another phrase? (y/n) [default: y]: ").lower().strip()
        if again and again != "y":
            print("👋 Goodbye!")
            break
