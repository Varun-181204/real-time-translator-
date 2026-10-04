/**
 * OmniTranslate AI - Core Client Application
 * Handles Real-Time Speech Recognition, Audio Visualizer, Translation,
 * Speech Synthesis, Two-Way Conversation, Profile & History Management.
 */

// Application State
const state = {
  config: null,
  profile: null,
  activeMode: 'translate', // 'translate', 'dialogue', 'voice'
  sourceLang: 'auto',
  targetLang: 'es',
  activeTone: 'natural',
  currentTranslation: null,
  currentHistoryId: null,
  isListening: false,
  recognition: null,
  audioContext: null,
  analyser: null,
  microphoneStream: null,
  visualizerAnimId: null,
  dialogueSpeaker: 1,
  continuousVoiceActive: false,
  historyFilter: 'all', // 'all', 'starred'
  historyItems: [],
};

// Avatar preset mapping
const AVATAR_MAP = {
  astronaut: '🚀',
  wizard: '🧙‍♂️',
  detective: '🕵️',
  traveler: '🌍',
  sparkle: '✨',
  robot: '🤖',
};

// -------------------------------------------------------------
// 1. Initialization
// -------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  await fetchAppConfig();
  initLucide();
  setupEventListeners();
  setupSpeechRecognition();
  loadHistory();
  updateUIFromProfile();
});

function initLucide() {
  if (window.lucide) {
    lucide.createIcons();
  }
}

async function fetchAppConfig() {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    state.config = data;
    state.profile = data.profile || {};

    // Populate dropdowns & pills
    populateLanguageSelects();
    populateTonePills();
    populateProfileModalFields();

    // Check system API key status badge
    updateEngineBadge();
  } catch (err) {
    console.error('Failed to load configuration:', err);
    showToast('Failed to load system config', 'error');
  }
}

function updateEngineBadge() {
  const badge = document.getElementById('engine-status-badge');
  const text = document.getElementById('engine-status-text');
  if (state.profile?.custom_api_key) {
    text.textContent = 'Custom Gemini Key';
    badge.className = 'flex items-center space-x-2 px-2.5 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-300 hover:bg-purple-500/20 transition-all text-xs font-medium cursor-pointer';
  } else if (state.config?.env_key_present) {
    text.textContent = 'Gemini 3.8 Active';
    badge.className = 'flex items-center space-x-2 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-all text-xs font-medium cursor-pointer';
  } else {
    text.textContent = 'Fallback Mode';
    badge.className = 'flex items-center space-x-2 px-2.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 transition-all text-xs font-medium cursor-pointer';
  }
}

function updateUIFromProfile() {
  if (!state.profile) return;
  
  // Update header avatar & username
  const navAvatar = document.getElementById('nav-avatar');
  const navUsername = document.getElementById('nav-username');
  const emoji = AVATAR_MAP[state.profile.avatar] || '🚀';
  
  if (navAvatar) navAvatar.textContent = emoji;
  if (navUsername) navUsername.textContent = state.profile.name || 'Voyager';

  // Update default languages if not already touched
  state.sourceLang = state.profile.native_language || 'auto';
  state.targetLang = state.profile.default_target || 'es';
  state.activeTone = state.profile.tone || 'natural';

  const srcSelect = document.getElementById('source-lang-select');
  const tgtSelect = document.getElementById('target-lang-select');
  if (srcSelect) srcSelect.value = state.sourceLang;
  if (tgtSelect) tgtSelect.value = state.targetLang;

  // Highlight active tone
  highlightActiveTonePill();

  // Auto-speak indicator
  const autoSpeakInd = document.getElementById('auto-speak-indicator');
  if (autoSpeakInd) {
    autoSpeakInd.innerHTML = state.profile.auto_speak 
      ? '<i data-lucide="volume-check" class="w-3.5 h-3.5 mr-1 text-emerald-400"></i> Auto-Speak On'
      : '<i data-lucide="volume-x" class="w-3.5 h-3.5 mr-1 text-slate-500"></i> Auto-Speak Off';
    initLucide();
  }
}

// -------------------------------------------------------------
// 2. DOM Population
// -------------------------------------------------------------
function populateLanguageSelects() {
  if (!state.config?.languages) return;
  const langs = state.config.languages;

  const srcSelect = document.getElementById('source-lang-select');
  const tgtSelect = document.getElementById('target-lang-select');
  const dlg1 = document.getElementById('dialogue-lang-1');
  const dlg2 = document.getElementById('dialogue-lang-2');
  const profNative = document.getElementById('profile-native-lang');
  const profTarget = document.getElementById('profile-target-lang');

  const populate = (elem, includeAuto = false) => {
    if (!elem) return;
    elem.innerHTML = '';
    langs.forEach(lang => {
      if (lang.code === 'auto' && !includeAuto) return;
      const opt = document.createElement('option');
      opt.value = lang.code;
      opt.textContent = `${lang.flag} ${lang.name}`;
      elem.appendChild(opt);
    });
  };

  populate(srcSelect, true);
  populate(tgtSelect, false);
  populate(dlg1, false);
  populate(dlg2, false);
  populate(profNative, false);
  populate(profTarget, false);

  if (tgtSelect) tgtSelect.value = 'es';
  if (dlg1) dlg1.value = 'en';
  if (dlg2) dlg2.value = 'es';
}

function populateTonePills() {
  if (!state.config?.tones) return;
  const container = document.getElementById('tone-pills-container');
  if (!container) return;
  container.innerHTML = '';

  state.config.tones.forEach(t => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `tone-pill px-2.5 py-1 rounded-lg text-xs font-medium border border-white/10 text-slate-300 hover:text-white hover:bg-white/10 ${t.id === state.activeTone ? 'active' : ''}`;
    btn.setAttribute('data-tone-id', t.id);
    btn.innerHTML = `<span>${t.name}</span>`;
    btn.onclick = () => selectTone(t.id);
    container.appendChild(btn);
  });

  // Profile modal tone select
  const profTone = document.getElementById('profile-tone-select');
  if (profTone) {
    profTone.innerHTML = '';
    state.config.tones.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.name;
      profTone.appendChild(opt);
    });
  }
}

function selectTone(toneId) {
  state.activeTone = toneId;
  highlightActiveTonePill();
  // If source text exists, re-translate automatically with new tone
  const input = document.getElementById('source-input')?.value?.trim();
  if (input) {
    triggerTranslation();
  }
}

function highlightActiveTonePill() {
  document.querySelectorAll('.tone-pill').forEach(btn => {
    if (btn.getAttribute('data-tone-id') === state.activeTone) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

// -------------------------------------------------------------
// 3. Event Listeners & Shortcuts
// -------------------------------------------------------------
function setupEventListeners() {
  const sourceInput = document.getElementById('source-input');
  if (sourceInput) {
    sourceInput.addEventListener('input', () => {
      const len = sourceInput.value.length;
      document.getElementById('source-char-count').textContent = `${len} chars`;
      const clearBtn = document.getElementById('clear-input-btn');
      if (clearBtn) clearBtn.classList.toggle('hidden', len === 0);
    });

    // Keyboard shortcut: Ctrl + Enter to translate
    sourceInput.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        triggerTranslation();
      }
    });
  }

  // Global keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    // Ctrl + S: Swap languages
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && state.activeMode === 'translate') {
      e.preventDefault();
      swapLanguages();
    }
    // Space when not typing in textarea: toggle microphone
    if (e.code === 'Space' && document.activeElement.tagName !== 'TEXTAREA' && document.activeElement.tagName !== 'INPUT') {
      e.preventDefault();
      toggleMicrophone();
    }
  });
}

// -------------------------------------------------------------
// 4. Mode Switching
// -------------------------------------------------------------
function switchMode(mode) {
  state.activeMode = mode;
  
  // Stop any active mic/continuous listening
  stopMicrophone();
  if (state.continuousVoiceActive) {
    toggleContinuousVoice();
  }

  // Update tabs
  document.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
  const activeTab = document.getElementById(`nav-mode-${mode}`);
  if (activeTab) activeTab.classList.add('active');

  // Toggle views
  document.getElementById('view-translate').classList.toggle('hidden', mode !== 'translate');
  document.getElementById('view-dialogue').classList.toggle('hidden', mode !== 'dialogue');
  document.getElementById('view-voice').classList.toggle('hidden', mode !== 'voice');

  initLucide();
}

// -------------------------------------------------------------
// 5. Translation Logic
// -------------------------------------------------------------
async function triggerTranslation(customText = null, overrideTarget = null, overrideSource = null) {
  const sourceInput = document.getElementById('source-input');
  const text = customText !== null ? customText : sourceInput?.value?.trim();

  if (!text) {
    showToast('Please enter text or speak into the microphone', 'info');
    return;
  }

  const targetLang = overrideTarget || document.getElementById('target-lang-select').value;
  const sourceLang = overrideSource || document.getElementById('source-lang-select').value;
  const tone = state.activeTone || 'natural';
  const model = state.profile?.model || 'gemini-3.8-flash';
  const customApiKey = state.profile?.custom_api_key || '';

  // Show loading UI
  setTranslationLoading(true);

  try {
    const res = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        target_lang: targetLang,
        source_lang: sourceLang,
        tone,
        model,
        custom_api_key: customApiKey,
        save_history: true
      })
    });

    const data = await res.json();
    setTranslationLoading(false);

    if (data.success) {
      state.currentTranslation = data;
      state.currentHistoryId = data.history_id;
      renderTranslationResult(data);

      // Auto-speak if enabled
      if (state.profile?.auto_speak) {
        speakText(data.translated_text, targetLang);
      }

      // Refresh history list
      loadHistory();
    } else {
      showToast(data.error || 'Translation failed', 'error');
    }
  } catch (err) {
    setTranslationLoading(false);
    console.error('Translation request error:', err);
    showToast('Network error during translation', 'error');
  }
}

function setTranslationLoading(isLoading) {
  const loader = document.getElementById('translation-loader');
  const container = document.getElementById('target-text-container');
  const btn = document.getElementById('translate-action-btn');

  if (loader) loader.classList.toggle('hidden', !isLoading);
  if (container) container.classList.toggle('opacity-40', isLoading);
  if (btn) btn.disabled = isLoading;
}

function renderTranslationResult(data) {
  const container = document.getElementById('target-text-container');
  const pronCard = document.getElementById('pronunciation-card');
  const pronText = document.getElementById('pronunciation-text');
  const nuanceCard = document.getElementById('nuance-card');
  const nuanceText = document.getElementById('nuance-text');
  const enginePill = document.getElementById('engine-used-pill');
  const detectedPill = document.getElementById('detected-lang-pill');
  const starIcon = document.getElementById('star-icon');

  if (container) {
    container.textContent = data.translated_text;
    container.classList.remove('opacity-40');
  }

  // Pronunciation
  if (data.pronunciation && data.pronunciation.trim()) {
    pronText.textContent = data.pronunciation;
    pronCard.classList.remove('hidden');
  } else {
    pronCard.classList.add('hidden');
  }

  // Nuance
  if (data.nuance_note && data.nuance_note.trim()) {
    nuanceText.textContent = data.nuance_note;
    nuanceCard.classList.remove('hidden');
  } else {
    nuanceCard.classList.add('hidden');
  }

  // Engine badge
  if (enginePill) {
    enginePill.textContent = data.engine || 'Gemini 3.8 Flash';
  }

  // Detected source language pill
  if (detectedPill && data.detected_source_lang) {
    detectedPill.textContent = `Detected: ${data.detected_source_lang.toUpperCase()}`;
    detectedPill.classList.remove('hidden');
  }

  // Star status reset
  if (starIcon) {
    starIcon.classList.remove('fill-amber-400', 'text-amber-400');
    starIcon.classList.add('text-slate-400');
  }

  initLucide();
}

function clearSourceInput() {
  const input = document.getElementById('source-input');
  if (input) {
    input.value = '';
    document.getElementById('source-char-count').textContent = '0 chars';
    document.getElementById('clear-input-btn')?.classList.add('hidden');
    document.getElementById('detected-lang-pill')?.classList.add('hidden');
    input.focus();
  }
}

function swapLanguages() {
  const src = document.getElementById('source-lang-select');
  const tgt = document.getElementById('target-lang-select');
  const sourceInput = document.getElementById('source-input');
  const targetContainer = document.getElementById('target-text-container');

  if (src.value === 'auto') {
    // If auto, change source to previous target
    src.value = tgt.value;
    tgt.value = state.profile?.native_language || 'en';
  } else {
    const temp = src.value;
    src.value = tgt.value;
    tgt.value = temp;
  }

  // Swap text if translation exists
  if (state.currentTranslation && targetContainer && targetContainer.textContent.trim()) {
    const prevTranslation = targetContainer.textContent.trim();
    sourceInput.value = prevTranslation;
    document.getElementById('source-char-count').textContent = `${prevTranslation.length} chars`;
    triggerTranslation();
  }
}

function handleSourceLangChange() {
  state.sourceLang = document.getElementById('source-lang-select').value;
}

function handleTargetLangChange() {
  state.targetLang = document.getElementById('target-lang-select').value;
  // If there is input, re-translate
  const input = document.getElementById('source-input')?.value?.trim();
  if (input) triggerTranslation();
}

// -------------------------------------------------------------
// 6. Speech Recognition & Web Audio Visualizer
// -------------------------------------------------------------
function setupSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn('Web Speech Recognition API not supported in this browser.');
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;

  recognition.onstart = () => {
    state.isListening = true;
    updateMicButtonUI(true);
    startVisualizer();
  };

  recognition.onresult = (event) => {
    let interimTranscript = '';
    let finalTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      } else {
        interimTranscript += event.results[i][0].transcript;
      }
    }

    const currentText = finalTranscript || interimTranscript;

    if (state.activeMode === 'translate') {
      const input = document.getElementById('source-input');
      if (input && currentText) {
        input.value = currentText;
        document.getElementById('source-char-count').textContent = `${input.value.length} chars`;
        document.getElementById('clear-input-btn')?.classList.remove('hidden');
      }
    } else if (state.activeMode === 'dialogue') {
      // In dialogue mode, we track current speaker utterance
      state.dialogueCurrentText = currentText;
    } else if (state.activeMode === 'voice') {
      const studioText = document.getElementById('studio-transcript');
      if (studioText) studioText.textContent = currentText;
    }
  };

  recognition.onerror = (event) => {
    console.warn('Speech recognition error:', event.error);
    stopMicrophone();
  };

  recognition.onend = () => {
    state.isListening = false;
    updateMicButtonUI(false);
    stopVisualizer();

    if (state.activeMode === 'translate') {
      const text = document.getElementById('source-input')?.value?.trim();
      if (text) triggerTranslation();
    } else if (state.activeMode === 'dialogue') {
      handleDialogueUtteranceFinished();
    } else if (state.activeMode === 'voice' && state.continuousVoiceActive) {
      // Re-start continuous listening if active
      setTimeout(() => {
        if (state.continuousVoiceActive) {
          try { recognition.start(); } catch(e){}
        }
      }, 300);
    }
  };

  state.recognition = recognition;
}

function toggleMicrophone() {
  if (state.isListening) {
    stopMicrophone();
  } else {
    startMicrophone();
  }
}

function startMicrophone() {
  if (!state.recognition) {
    showToast('Microphone speech recognition not available in your browser.', 'error');
    return;
  }

  // Set language for recognition
  let langCode = state.sourceLang;
  if (langCode === 'auto') {
    langCode = state.profile?.native_language || 'en';
  }
  
  // Find speech locale code
  const match = state.config?.languages?.find(l => l.code === langCode);
  state.recognition.lang = match?.speech_code || 'en-US';

  try {
    state.recognition.start();
  } catch (err) {
    console.warn('Recognition start exception:', err);
  }
}

function stopMicrophone() {
  if (state.recognition && state.isListening) {
    try {
      state.recognition.stop();
    } catch(e){}
  }
  state.isListening = false;
  updateMicButtonUI(false);
  stopVisualizer();
}

function updateMicButtonUI(isRecording) {
  const btn = document.getElementById('mic-toggle-btn');
  const icon = document.getElementById('mic-btn-icon');
  const text = document.getElementById('mic-btn-text');
  const banner = document.getElementById('mic-visualizer-container');

  if (isRecording) {
    btn?.classList.remove('bg-purple-600', 'hover:bg-purple-500');
    btn?.classList.add('bg-rose-600', 'hover:bg-rose-500', 'animate-pulse');
    if (text) text.textContent = 'Listening...';
    banner?.classList.remove('hidden');
  } else {
    btn?.classList.remove('bg-rose-600', 'hover:bg-rose-500', 'animate-pulse');
    btn?.classList.add('bg-purple-600', 'hover:bg-purple-500');
    if (text) text.textContent = 'Speak';
    banner?.classList.add('hidden');
  }
}

// -------------------------------------------------------------
// 7. Dynamic Web Audio Waveform Visualizer
// -------------------------------------------------------------
async function startVisualizer() {
  const canvas = document.getElementById('mic-waveform');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  try {
    if (!state.audioContext) {
      state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (state.audioContext.state === 'suspended') {
      await state.audioContext.resume();
    }

    state.microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const source = state.audioContext.createMediaStreamSource(state.microphoneStream);
    state.analyser = state.audioContext.createAnalyser();
    state.analyser.fftSize = 64;
    source.connect(state.analyser);

    const bufferLength = state.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      state.visualizerAnimId = requestAnimationFrame(draw);
      state.analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const barWidth = (canvas.width / bufferLength) * 1.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height;
        ctx.fillStyle = `rgb(${140 + barHeight * 2}, ${80 + barHeight}, 255)`;
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        x += barWidth + 2;
      }
    };
    draw();
  } catch (err) {
    console.warn('Audio Visualizer setup skipped or mic permission denied:', err);
  }
}

function stopVisualizer() {
  if (state.visualizerAnimId) {
    cancelAnimationFrame(state.visualizerAnimId);
    state.visualizerAnimId = null;
  }
  if (state.microphoneStream) {
    state.microphoneStream.getTracks().forEach(track => track.stop());
    state.microphoneStream = null;
  }
}

// -------------------------------------------------------------
// 8. Text-to-Speech (TTS)
// -------------------------------------------------------------
function speakTranslatedText() {
  const text = state.currentTranslation?.translated_text;
  const lang = state.targetLang;
  if (text) {
    speakText(text, lang);
  } else {
    showToast('No translation to speak', 'info');
  }
}

function speakSourceText() {
  const text = document.getElementById('source-input')?.value?.trim();
  const lang = state.sourceLang === 'auto' ? (state.profile?.native_language || 'en') : state.sourceLang;
  if (text) {
    speakText(text, lang);
  } else {
    showToast('Please enter text to listen', 'info');
  }
}

function speakText(text, langCode) {
  if (!window.speechSynthesis) {
    fallbackServerTTS(text, langCode);
    return;
  }

  window.speechSynthesis.cancel(); // Cancel any ongoing speech
  const utterance = new SpeechSynthesisUtterance(text);
  
  // Set rate & pitch from profile
  utterance.rate = state.profile?.speech_rate || 1.0;
  utterance.pitch = 1.0;

  // Find matching voice if available
  const voices = window.speechSynthesis.getVoices();
  const simpleLang = langCode.split('-')[0].toLowerCase();
  const matchedVoice = voices.find(v => v.lang.toLowerCase().startsWith(simpleLang));
  if (matchedVoice) {
    utterance.voice = matchedVoice;
  }

  // Visual button feedback
  const icon = document.getElementById('speak-target-icon');
  if (icon) icon.classList.add('text-purple-400', 'animate-pulse');

  utterance.onend = () => {
    if (icon) icon.classList.remove('text-purple-400', 'animate-pulse');
  };

  utterance.onerror = () => {
    if (icon) icon.classList.remove('text-purple-400', 'animate-pulse');
    fallbackServerTTS(text, langCode);
  };

  window.speechSynthesis.speak(utterance);
}

function fallbackServerTTS(text, langCode) {
  const audio = new Audio(`/api/tts?text=${encodeURIComponent(text)}&lang=${encodeURIComponent(langCode)}`);
  audio.play().catch(e => console.warn('Server TTS playback error:', e));
}

function downloadTTSAudio() {
  const text = state.currentTranslation?.translated_text;
  if (!text) {
    showToast('No translation to download', 'info');
    return;
  }
  const lang = state.targetLang;
  window.open(`/api/tts?text=${encodeURIComponent(text)}&lang=${encodeURIComponent(lang)}`, '_blank');
}

// -------------------------------------------------------------
// 9. Two-Way Conversation / Dialogue Mode
// -------------------------------------------------------------
function startDialogueSpeaker(speakerNum) {
  state.dialogueSpeaker = speakerNum;
  const lang1 = document.getElementById('dialogue-lang-1').value;
  const lang2 = document.getElementById('dialogue-lang-2').value;

  const activeLang = speakerNum === 1 ? lang1 : lang2;
  const match = state.config?.languages?.find(l => l.code === activeLang);

  if (state.recognition) {
    state.recognition.lang = match?.speech_code || 'en-US';
    try {
      state.recognition.start();
      const micBtn = document.getElementById(`dialogue-mic-${speakerNum}`);
      micBtn?.classList.add('animate-pulse', 'ring-4', 'ring-purple-500/50');
    } catch(e) {}
  }
}

async function handleDialogueUtteranceFinished() {
  const text = state.dialogueCurrentText?.trim();
  state.dialogueCurrentText = '';
  document.querySelectorAll('[id^="dialogue-mic-"]').forEach(btn => btn.classList.remove('animate-pulse', 'ring-4', 'ring-purple-500/50'));

  if (!text) return;

  const speaker = state.dialogueSpeaker;
  const lang1 = document.getElementById('dialogue-lang-1').value;
  const lang2 = document.getElementById('dialogue-lang-2').value;

  const srcLang = speaker === 1 ? lang1 : lang2;
  const tgtLang = speaker === 1 ? lang2 : lang1;

  // Append user message bubble
  appendDialogueBubble(speaker, text, 'translating...');

  try {
    const res = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        source_lang: srcLang,
        target_lang: tgtLang,
        tone: state.profile?.tone || 'casual',
        model: state.profile?.model || 'gemini-3.8-flash',
        custom_api_key: state.profile?.custom_api_key || '',
        save_history: true
      })
    });

    const data = await res.json();
    if (data.success) {
      updateLastDialogueBubble(data.translated_text);
      if (state.profile?.auto_speak) {
        speakText(data.translated_text, tgtLang);
      }
    }
  } catch (err) {
    console.error('Dialogue translation error:', err);
  }
}

function appendDialogueBubble(speaker, originalText, translatedPlaceholder) {
  const chatStream = document.getElementById('dialogue-chat-stream');
  if (!chatStream) return;

  const isSpeaker1 = speaker === 1;
  const bubble = document.createElement('div');
  bubble.className = `flex ${isSpeaker1 ? 'justify-start' : 'justify-end'} animate-in fade-in slide-in-from-bottom-2 duration-300`;
  bubble.innerHTML = `
    <div class="max-w-[80%] p-3.5 ${isSpeaker1 ? 'chat-bubble-speaker1' : 'chat-bubble-speaker2'} shadow-xl">
      <div class="flex items-center space-x-2 mb-1 text-[11px] font-bold ${isSpeaker1 ? 'text-purple-300' : 'text-indigo-300'}">
        <span>${isSpeaker1 ? 'Speaker 1' : 'Speaker 2'}</span>
      </div>
      <p class="text-xs text-slate-300 mb-1.5 opacity-90">${originalText}</p>
      <div class="border-t border-white/10 pt-1.5">
        <p class="text-sm font-semibold text-white dialogue-translated-text">${translatedPlaceholder}</p>
      </div>
    </div>
  `;
  chatStream.appendChild(bubble);
  chatStream.scrollTop = chatStream.scrollHeight;
}

function updateLastDialogueBubble(translatedText) {
  const stream = document.getElementById('dialogue-chat-stream');
  const lastBubble = stream?.querySelector('.dialogue-translated-text:last-of-type');
  if (lastBubble) {
    lastBubble.textContent = translatedText;
  }
}

function clearDialogueStream() {
  const stream = document.getElementById('dialogue-chat-stream');
  if (stream) {
    stream.innerHTML = `
      <div class="text-center py-8 text-slate-500 text-xs">
        <i data-lucide="mic-2" class="w-8 h-8 mx-auto text-purple-400/40 mb-2"></i>
        <p>Chat cleared. Tap either speaker's microphone to start talking.</p>
      </div>
    `;
    initLucide();
  }
}

// -------------------------------------------------------------
// 10. Voice Studio Mode
// -------------------------------------------------------------
function toggleContinuousVoice() {
  state.continuousVoiceActive = !state.continuousVoiceActive;
  const btn = document.getElementById('continuous-voice-btn');
  const label = document.getElementById('cont-voice-label');
  const icon = document.getElementById('cont-voice-icon');
  const statusPill = document.getElementById('studio-status-pill');

  if (state.continuousVoiceActive) {
    btn.classList.add('bg-rose-600', 'hover:bg-rose-500');
    label.textContent = 'Stop Listening';
    icon.setAttribute('data-lucide', 'square');
    statusPill.textContent = 'Listening Live';
    statusPill.className = 'text-rose-400 font-mono text-[11px] animate-pulse';
    startMicrophone();
  } else {
    btn.classList.remove('bg-rose-600', 'hover:bg-rose-500');
    label.textContent = 'Start Continuous Listening';
    icon.setAttribute('data-lucide', 'play');
    statusPill.textContent = 'Ready';
    statusPill.className = 'text-emerald-400 font-mono text-[11px]';
    stopMicrophone();
  }
  initLucide();
}

// -------------------------------------------------------------
// 11. History & Saved Translations
// -------------------------------------------------------------
async function loadHistory() {
  try {
    const res = await fetch(`/api/history?limit=100&favorites_only=${state.historyFilter === 'starred'}`);
    const data = await res.json();
    state.historyItems = data.items || [];
    renderHistoryList(state.historyItems);
  } catch (err) {
    console.error('Failed to load history:', err);
  }
}

function renderHistoryList(items) {
  const container = document.getElementById('history-items-list');
  if (!container) return;
  container.innerHTML = '';

  if (items.length === 0) {
    container.innerHTML = `
      <div class="text-center py-10 text-slate-500 text-xs">
        <i data-lucide="inbox" class="w-8 h-8 mx-auto mb-2 text-slate-600"></i>
        <p>No history entries found.</p>
      </div>
    `;
    initLucide();
    return;
  }

  items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 transition-all text-xs space-y-1.5 relative group';
    card.innerHTML = `
      <div class="flex items-center justify-between text-[10px] text-slate-400">
        <span class="font-mono">${item.source_lang.toUpperCase()} → ${item.target_lang.toUpperCase()}</span>
        <div class="flex items-center space-x-1.5">
          <button onclick="toggleHistoryItemStar(${item.id})" class="p-1 hover:text-amber-400 ${item.is_favorite ? 'text-amber-400' : 'text-slate-500'}">
            <i data-lucide="star" class="w-3.5 h-3.5 ${item.is_favorite ? 'fill-amber-400' : ''}"></i>
          </button>
          <button onclick="deleteHistoryItem(${item.id})" class="p-1 hover:text-rose-400 text-slate-500">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </div>
      <p class="text-slate-300 line-clamp-2 cursor-pointer" onclick="recallHistory(${item.id})">${item.source_text}</p>
      <p class="font-semibold text-purple-300 line-clamp-2 cursor-pointer" onclick="recallHistory(${item.id})">${item.translated_text}</p>
      ${item.pronunciation ? `<p class="text-[11px] font-mono text-purple-200/70 truncate">🔊 ${item.pronunciation}</p>` : ''}
    `;
    container.appendChild(card);
  });

  initLucide();
}

function recallHistory(id) {
  const item = state.historyItems.find(i => i.id === id);
  if (!item) return;

  const srcInput = document.getElementById('source-input');
  const srcSelect = document.getElementById('source-lang-select');
  const tgtSelect = document.getElementById('target-lang-select');

  if (srcInput) srcInput.value = item.source_text;
  if (srcSelect) srcSelect.value = item.source_lang;
  if (tgtSelect) tgtSelect.value = item.target_lang;

  state.currentTranslation = {
    translated_text: item.translated_text,
    pronunciation: item.pronunciation,
    nuance_note: item.notes,
    engine: item.engine,
    detected_source_lang: item.source_lang,
  };
  state.currentHistoryId = item.id;
  renderTranslationResult(state.currentTranslation);

  // Close drawer
  toggleHistoryDrawer();
  showToast('Translation restored from history', 'info');
}

async function toggleHistoryItemStar(id) {
  try {
    const res = await fetch('/api/history/favorite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    const data = await res.json();
    if (data.success) {
      loadHistory();
    }
  } catch (err) {
    console.error('Failed to toggle star:', err);
  }
}

async function toggleStarCurrent() {
  if (!state.currentHistoryId) {
    showToast('Translate something first to add to favorites', 'info');
    return;
  }
  await toggleHistoryItemStar(state.currentHistoryId);
  const icon = document.getElementById('star-icon');
  if (icon) {
    const isFav = icon.classList.contains('fill-amber-400');
    icon.classList.toggle('fill-amber-400', !isFav);
    icon.classList.toggle('text-amber-400', !isFav);
  }
  showToast('Favorites updated', 'success');
}

async function deleteHistoryItem(id) {
  try {
    await fetch(`/api/history?id=${id}`, { method: 'DELETE' });
    loadHistory();
    showToast('Item deleted', 'info');
  } catch (err) {
    console.error('Failed to delete history item:', err);
  }
}

async function clearHistoryConfirm() {
  if (!confirm('Are you sure you want to clear your translation history? Starred favorites will be preserved.')) return;
  try {
    await fetch('/api/history?keep_favorites=true', { method: 'DELETE' });
    loadHistory();
    showToast('History cleared (starred items preserved)', 'success');
  } catch (err) {
    console.error('Failed to clear history:', err);
  }
}

function filterHistory() {
  const query = document.getElementById('history-search-input')?.value?.toLowerCase() || '';
  const filtered = state.historyItems.filter(item => 
    item.source_text.toLowerCase().includes(query) || 
    item.translated_text.toLowerCase().includes(query)
  );
  renderHistoryList(filtered);
}

function setHistoryFilter(tab) {
  state.historyFilter = tab;
  document.getElementById('hist-tab-all').className = tab === 'all' ? 'px-2.5 py-1 rounded-lg bg-purple-600/30 text-purple-300 font-semibold' : 'px-2.5 py-1 rounded-lg bg-white/5 text-slate-400 hover:text-white';
  document.getElementById('hist-tab-starred').className = tab === 'starred' ? 'px-2.5 py-1 rounded-lg bg-purple-600/30 text-purple-300 font-semibold' : 'px-2.5 py-1 rounded-lg bg-white/5 text-slate-400 hover:text-white';
  loadHistory();
}

function exportHistoryData(format) {
  window.open(`/api/export?format=${format}`, '_blank');
}

function toggleHistoryDrawer() {
  const drawer = document.getElementById('history-drawer');
  const backdrop = document.getElementById('history-backdrop');
  const isOpen = !drawer.classList.contains('translate-x-full');

  if (isOpen) {
    drawer.classList.add('translate-x-full');
    backdrop.classList.add('hidden');
  } else {
    drawer.classList.remove('translate-x-full');
    backdrop.classList.remove('hidden');
    loadHistory();
  }
}

// -------------------------------------------------------------
// 12. User Profile & Settings Modal
// -------------------------------------------------------------
function openProfileModal(scrollTarget = null) {
  const modal = document.getElementById('profile-modal-backdrop');
  if (modal) {
    populateProfileModalFields();
    modal.classList.remove('hidden');
    if (scrollTarget) {
      setTimeout(() => {
        document.getElementById(scrollTarget)?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }
}

function closeProfileModal() {
  const modal = document.getElementById('profile-modal-backdrop');
  if (modal) modal.classList.add('hidden');
}

function populateProfileModalFields() {
  if (!state.profile) return;
  
  const nameInput = document.getElementById('profile-name-input');
  const keyInput = document.getElementById('profile-api-key-input');
  const autoSpeakToggle = document.getElementById('profile-autospeak-toggle');
  const speechRateSlider = document.getElementById('profile-speech-rate');
  const rateLabel = document.getElementById('speech-rate-label');
  const nativeSelect = document.getElementById('profile-native-lang');
  const targetSelect = document.getElementById('profile-target-lang');
  const toneSelect = document.getElementById('profile-tone-select');
  const keyStatus = document.getElementById('profile-key-status');

  if (nameInput) nameInput.value = state.profile.name || '';
  if (keyInput) keyInput.value = state.profile.custom_api_key || '';
  if (autoSpeakToggle) autoSpeakToggle.checked = Boolean(state.profile.auto_speak);
  if (speechRateSlider) speechRateSlider.value = state.profile.speech_rate || 1.0;
  if (rateLabel) rateLabel.textContent = `${state.profile.speech_rate || 1.0}x`;
  if (nativeSelect) nativeSelect.value = state.profile.native_language || 'en';
  if (targetSelect) targetSelect.value = state.profile.default_target || 'es';
  if (toneSelect) toneSelect.value = state.profile.tone || 'natural';

  selectAvatar(state.profile.avatar || 'astronaut', AVATAR_MAP[state.profile.avatar] || '🚀');

  if (keyStatus) {
    if (state.profile.custom_api_key) {
      keyStatus.textContent = 'Custom Key Configured';
      keyStatus.className = 'text-[11px] font-mono px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300';
    } else if (state.config?.env_key_present) {
      keyStatus.textContent = 'System GEMINI_API_KEY Active';
      keyStatus.className = 'text-[11px] font-mono px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300';
    } else {
      keyStatus.textContent = 'No Key Configured';
      keyStatus.className = 'text-[11px] font-mono px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300';
    }
  }
}

let selectedAvatarKey = 'astronaut';
function selectAvatar(key, emoji) {
  selectedAvatarKey = key;
  const preview = document.getElementById('profile-avatar-preview');
  if (preview) preview.textContent = emoji;
}

function toggleKeyVisibility() {
  const input = document.getElementById('profile-api-key-input');
  const icon = document.getElementById('key-vis-icon');
  if (input) {
    if (input.type === 'password') {
      input.type = 'text';
      icon?.setAttribute('data-lucide', 'eye-off');
    } else {
      input.type = 'password';
      icon?.setAttribute('data-lucide', 'eye');
    }
    initLucide();
  }
}

async function testApiKeyButton() {
  const key = document.getElementById('profile-api-key-input')?.value?.trim() || '';
  const btn = document.getElementById('test-key-btn');
  btn.innerHTML = `<span class="animate-spin inline-block w-3.5 h-3.5 border-2 border-purple-400 border-t-transparent rounded-full mr-1"></span> Testing...`;

  try {
    const res = await fetch('/api/test-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: key })
    });
    const data = await res.json();
    btn.innerHTML = `<i data-lucide="shield-check" class="w-3.5 h-3.5 mr-1"></i> Tested`;
    initLucide();

    if (data.valid) {
      showToast(`Success: ${data.message}`, 'success');
    } else {
      showToast(`Key Error: ${data.message}`, 'error');
    }
  } catch (err) {
    btn.innerHTML = `<i data-lucide="shield-check" class="w-3.5 h-3.5 mr-1"></i> Test Key`;
    initLucide();
    showToast('Failed to reach validation service', 'error');
  }
}

async function saveProfileChanges() {
  const updatedData = {
    name: document.getElementById('profile-name-input')?.value?.trim() || 'Cosmic Voyager',
    avatar: selectedAvatarKey,
    native_language: document.getElementById('profile-native-lang')?.value || 'en',
    default_target: document.getElementById('profile-target-lang')?.value || 'es',
    tone: document.getElementById('profile-tone-select')?.value || 'natural',
    auto_speak: document.getElementById('profile-autospeak-toggle')?.checked ?? true,
    speech_rate: parseFloat(document.getElementById('profile-speech-rate')?.value || 1.0),
    custom_api_key: document.getElementById('profile-api-key-input')?.value?.trim() || '',
    model: 'gemini-3.8-flash'
  };

  try {
    const res = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedData)
    });
    const data = await res.json();
    if (data.success) {
      state.profile = data.profile;
      updateUIFromProfile();
      updateEngineBadge();
      closeProfileModal();
      showToast('Profile and preferences updated successfully!', 'success');
    }
  } catch (err) {
    console.error('Failed to save profile:', err);
    showToast('Failed to save profile', 'error');
  }
}

// -------------------------------------------------------------
// 13. File Audio Upload
// -------------------------------------------------------------
async function handleAudioUpload(inputElem) {
  if (!inputElem.files || !inputElem.files[0]) return;
  const file = inputElem.files[0];
  const formData = new FormData();
  formData.append('audio', file);
  formData.append('lang', state.sourceLang === 'auto' ? 'en-US' : state.sourceLang);

  showToast(`Uploading ${file.name} for speech transcription...`, 'info');

  try {
    const res = await fetch('/api/transcribe', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.success && data.text) {
      const srcInput = document.getElementById('source-input');
      if (srcInput) {
        srcInput.value = data.text;
        document.getElementById('source-char-count').textContent = `${data.text.length} chars`;
        document.getElementById('clear-input-btn')?.classList.remove('hidden');
      }
      showToast('Audio transcribed successfully!', 'success');
      triggerTranslation();
    } else {
      showToast(data.error || 'Audio transcription failed', 'error');
    }
  } catch (err) {
    showToast('Failed to upload/transcribe audio', 'error');
  }
  inputElem.value = '';
}

// -------------------------------------------------------------
// 14. Clipboard & Toast Notifications
// -------------------------------------------------------------
function copyTranslation() {
  const text = state.currentTranslation?.translated_text;
  if (!text) {
    showToast('No translation to copy', 'info');
    return;
  }
  navigator.clipboard.writeText(text).then(() => {
    showToast('Copied translation to clipboard!', 'success');
    const copyIcon = document.getElementById('copy-icon');
    if (copyIcon) {
      copyIcon.setAttribute('data-lucide', 'check');
      initLucide();
      setTimeout(() => {
        copyIcon.setAttribute('data-lucide', 'copy');
        initLucide();
      }, 2000);
    }
  });
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  const bgStyles = {
    success: 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200',
    error: 'bg-rose-950/90 border-rose-500/40 text-rose-200',
    info: 'bg-purple-950/90 border-purple-500/40 text-purple-200',
  }[type] || 'bg-slate-900/90 border-slate-700 text-slate-200';

  toast.className = `p-3.5 rounded-2xl border backdrop-blur-xl shadow-2xl flex items-center space-x-2 text-xs font-medium toast-enter pointer-events-auto ${bgStyles}`;
  toast.innerHTML = `
    <span>${message}</span>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
