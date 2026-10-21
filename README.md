# 🌐 OmniTranslate AI — Real-Time Multilingual Studio

**OmniTranslate AI** is a multilingual translation web application that combines AI-powered text translation, speech recognition, text-to-speech, and two-way conversation tools in one interface.

Powered by Google Gemini, the application is designed to make communication across languages more accessible through contextual translations, pronunciation assistance, customizable translation styles, and translation history.

**🌍 Live Demo:** [omnitranslate-ai.onrender.com](https://omnitranslate-ai.onrender.com)  
**💻 GitHub Repository:** [real-time-translator-](https://github.com/Varun-181204/real-time-translator-)

---

## ✨ Features

### 🚀 1. AI-Powered Translation

- **Context-aware translations:** Generate natural translations using the configured Google Gemini model.
- **Pronunciation and transliteration:** Help users read unfamiliar scripts through romanized text where supported.
- **Cultural and linguistic context:** Explain idioms, politeness levels, and language-specific nuances.
- **Multiple translation styles:**
  - ✨ Natural & Fluent
  - 💼 Formal & Business
  - 💬 Casual & Conversational
  - 🧭 Traveler & Tourist
  - ⚡ Youth, Slang & Idiomatic
  - 📖 Simple & Direct

### 🎙️ 2. Speech and Audio Tools

- **Speech recognition:** Convert spoken words into text using browser-supported speech recognition.
- **Audio visualizer:** Animated waveform effects that respond to audio activity.
- **Text-to-speech:** Listen to translated text with supported voices, languages, and adjustable speech rates.
- **Audio transcription:** Upload supported audio files, such as WAV and MP3, for transcription and translation.
- **Continuous listening:** Support hands-free conversational translation where browser and application capabilities allow it.

### 💬 3. Two-Way Conversation Mode

- A split conversation interface for two people communicating in different languages.
- Separate microphone controls for Speaker A and Speaker B.
- Translation and optional speech playback to support natural conversations.

### 👤 4. Profiles and Personalization

- Personalized profiles with names and avatar choices.
- Preferred languages and translation settings.
- Custom Gemini API key configuration through the application interface.
- API key connection testing and masked key display.
- Automatic speech playback and configurable speech preferences.

### 📚 5. Translation History and Favorites

- Searchable translation history.
- Save and remove favorite translations.
- Recall previous translations.
- Export translation history to JSON or CSV, where supported by the application.

### 🗄️ 6. Database Support

- **SQLite:** Supports local development and testing.
- **MongoDB Atlas:** Supports cloud database storage when `MONGODB_URI` is configured.
- Stores user accounts, profiles, and translation history using the selected backend.

### 📱 7. Web Application Experience

- Responsive interface with modern styling and animations.
- Progressive Web App (PWA) assets.
- Flask-based backend and browser-based frontend.
- Deployment on Render.

---

## 🛠️ Technology Stack

| Component | Technologies |
|---|---|
| Backend | Python, Flask |
| Frontend | HTML, CSS, JavaScript |
| AI translation | Google Gemini API |
| Speech input | Browser Web Speech API |
| Speech output | Browser speech synthesis and supported audio services |
| Database | SQLite, MongoDB Atlas |
| Deployment | Render |
| Version control | Git, GitHub |

---

## 📂 Project Structure

```text
real_time_translator/
├── app.py                      # Flask web application and routes
├── config.py                   # Application configuration
├── database.py                 # Database backend selection
├── mongo_database.py           # MongoDB Atlas operations
├── migrate_sqlite_to_mongo.py  # SQLite-to-MongoDB migration utility
├── engine.py                   # Translation engine
├── translator.py               # Command-line translator
├── requirements.txt             # Python dependencies
├── run.bat                      # Windows launcher
├── .env.example                 # Example environment configuration
├── static/
│   ├── css/
│   │   └── style.css
│   └── js/
│       └── app.js
└── templates/
    └── index.html               # Main web interface
```

*Note: The structure above highlights the main application files. Additional assets, tests, and configuration files may also be present in the repository.*

---

## 🚀 Getting Started

### Prerequisites

- Python installed on your system.
- Git, if cloning the repository.
- A Google Gemini API key for AI-powered translation.
- A MongoDB Atlas connection URI if you want to use MongoDB locally.

### 1. Clone the repository

```bash
git clone https://github.com/Varun-181204/real-time-translator-.git
cd real-time-translator-
```

### 2. Create and activate a virtual environment

**Windows PowerShell**

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
```

**Windows Command Prompt**

```cmd
python -m venv venv
venv\Scripts\activate.bat
```

**Linux/macOS**

```bash
python -m venv venv
source venv/bin/activate
```

### 3. Install dependencies

```bash
python -m pip install -r requirements.txt
```

### 4. Configure environment variables

Create a `.env` file in the project root, using `.env.example` as a reference if it exists.

Example configuration:

```ini
SECRET_KEY=replace_with_a_secure_random_value
GEMINI_API_KEY=your_gemini_api_key
PORT=5000

# Optional: configure MongoDB Atlas
MONGODB_URI=your_mongodb_atlas_connection_uri
MONGODB_DB_NAME=omnitranslate
```

**Important:**

- Replace the example values with your own credentials.
- Do not commit `.env` files, passwords, API keys, or database connection strings to GitHub.
- Leave `MONGODB_URI` unset to use the application's local SQLite fallback.
- Configure MongoDB Atlas access and credentials before enabling the MongoDB backend.

### 5. Run the application

Start the Flask application:

```bash
python app.py
```

Alternatively, if your Windows launcher is configured:

```bat
run.bat
```

Open the local application at:

**http://127.0.0.1:5000**

If the application uses a different port in your environment, open the address printed by the server.

---

## 🔑 Gemini API Key Configuration

The application supports configuring a Gemini API key through the profile interface, if enabled in your current version.

You can also configure `GEMINI_API_KEY` as an environment variable.

Obtain an API key through [Google AI Studio](https://aistudio.google.com/).

Keep API keys private. Never place real credentials in source code or public documentation.

---

## ☁️ Deployment

The application is deployed on Render and uses MongoDB Atlas for cloud database storage when the corresponding environment variables are configured.

**Live application:** [https://omnitranslate-ai.onrender.com](https://omnitranslate-ai.onrender.com)

### Render configuration

| Setting | Value |
|---|---|
| Build command | `pip install -r requirements.txt` |
| Start command | `gunicorn app:app` |
| Database | MongoDB Atlas |
| Database name | `omnitranslate` |

Configure these environment variables in the Render dashboard:

- `SECRET_KEY`
- `GEMINI_API_KEY`
- `MONGODB_URI`
- `MONGODB_DB_NAME` — set to `omnitranslate`

Do not include actual secret values in this README.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl + Enter` | Translate the input text |
| `Ctrl + S` | Swap source and target languages |
| `Space` | Toggle microphone recording when focus is not in a text-entry field |

Shortcut availability may depend on browser support and the current application state.

---

## 🧪 Testing

Run the project's test suite from the repository root:

```bash
python test_suite.py
```

The local regression suite has passed all 15 checks, covering key application functionality such as authentication, profile handling, translation, history, favorites, and text-to-speech.

The local SQLite test results do not, by themselves, guarantee that every feature has been verified against the live MongoDB deployment.

---

## 🔒 Security Notes

- Keep API keys and database credentials in environment variables.
- Use a strong, unique Flask secret key.
- Restrict database network access where practical.
- Never commit local databases, secrets, virtual environments, or temporary backup files.
- Test authentication and data access before using the application with real user information.

---

## 📸 Screenshots

Screenshots of the actual application can be added here to demonstrate the interface and key features.

Recommended screenshots:

1. Main translation interface.
2. Two-way conversation mode.
3. User profile and language preferences.
4. Translation history and favorites.

For a clean GitHub presentation, store screenshots in a repository folder such as `docs/images/` and embed them here using relative Markdown image paths after uploading them.

---

## 📜 License

This project is intended to be distributed under the MIT License, provided the repository includes the corresponding `LICENSE` file.

