import sounddevice as sd
import soundfile as sf
import numpy as np
import tempfile
import speech_recognition as sr
from transformers import pipeline
from langdetect import detect
from gtts import gTTS
from playsound import playsound
import os

# -----------------------------
# 🎧 STEP 1: Record Speech
# -----------------------------
def listen():
    samplerate = 16000
    duration = 5  # seconds
    print("🎙️ Speak now (you have 5 seconds)...")
    audio_data = sd.rec(int(duration * samplerate), samplerate=samplerate, channels=1, dtype='int16')
    sd.wait()
    
    # Save the recorded audio temporarily
    temp_wav = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
    sf.write(temp_wav.name, audio_data, samplerate)
    
    # Convert audio to text
    recognizer = sr.Recognizer()
    with sr.AudioFile(temp_wav.name) as source:
        audio = recognizer.record(source)
        try:
            text = recognizer.recognize_google(audio)
            print("🗣️ You said:", text)
            return text
        except sr.UnknownValueError:
            print("❌ Sorry, I couldn't understand.")
            return ""
        except sr.RequestError:
            print("⚠️ Speech recognition service error.")
            return ""

# -----------------------------
# 🌍 STEP 2: Detect & Translate
# -----------------------------
def auto_translate(text, target_lang="en"):
    if not text:
        return ""
    print("🔍 Detecting language...")
    src_lang = detect(text)
    print(f"🧩 Detected Language: {src_lang}")

    # Initialize translator pipeline
    print(f"🌐 Translating from {src_lang} → {target_lang} ...")
    translator = pipeline("translation", model=f"Helsinki-NLP/opus-mt-{src_lang}-{target_lang}")
    translated = translator(text, max_length=512)
    translated_text = translated[0]['translation_text']
    print(f"✅ Translation: {translated_text}")
    return translated_text, target_lang

# -----------------------------
# 🔊 STEP 3: Speak Translation
# -----------------------------
def speak(text, lang="en"):
    if not text:
        return
    tts = gTTS(text=text, lang=lang)
    temp_mp3 = tempfile.NamedTemporaryFile(delete=False, suffix=".mp3")
    tts.save(temp_mp3.name)
    playsound(temp_mp3.name)
    os.remove(temp_mp3.name)

# -----------------------------
# 🚀 MAIN PROGRAM
# -----------------------------
if __name__ == "__main__":
    print("🔁 Real-Time Translator (Auto-Language) Started")
    target_language = input("Enter target language code (e.g., en for English, hi for Hindi, fr for French): ").strip().lower()
    
    while True:
        spoken_text = listen()
        translated_text, lang_code = auto_translate(spoken_text, target_lang=target_language)
        speak(translated_text, lang=target_language)
        print("--------------------------------------------------")
        again = input("Do you want to translate again? (y/n): ").lower()
        if again != "y":
            print("👋 Exiting translator. Goodbye!")
            break
