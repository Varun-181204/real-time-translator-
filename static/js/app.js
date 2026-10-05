/**
 * OmniTranslate - Core Client Application
 * Production Dark Navy + Electric Blue + Cyan Suite
 * Real-Time Speech Recognition, Audio Visualizer, Dynamic Health,
 * Authentication & Session Handling, Offline Support, History & Profile.
 */

// Application State
const state = {
  user: null,
  isAuthenticated: false,
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
  dialogueCurrentText: '',
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

let voiceStateTimeout = null;
let healthCheckInterval = null;

// -------------------------------------------------------------
// 1. Initialization
// -------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  // Register Service Worker for offline capabilities
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('/sw.js');
      console.log('OmniTranslate Service Worker registered');
    } catch (e) {
      console.warn('Service Worker registration skipped:', e);
    }
  }

  // Network connection status listeners
  window.addEventListener('online', () => {
    updateOnlineStatus();
    showToast('Internet connection restored', 'success');
  });

  window.addEventListener('offline', () => {
    updateOnlineStatus();
    showToast("You're offline. Translation requires an active internet connection.", 'error');
  });

  // Verify active user session
  await checkAuth();

  // If authenticated, initialize application components
  if (state.isAuthenticated) {
    await fetchAppConfig();
    initLucide();
    setupEventListeners();
    setupSpeechRecognition();
    loadHistory();
    updateUIFromProfile();
    setVoiceState('ready', 'Ready to speak');
    updateOnlineStatus();

    // Periodic dynamic health check every 30 seconds
    if (healthCheckInterval) clearInterval(healthCheckInterval);
    healthCheckInterval = setInterval(updateOnlineStatus, 30000);
  }
});

function initLucide() {
  if (window.lucide) {
    lucide.createIcons();
  }
}

// -------------------------------------------------------------
// 2. Authentication & Session Management
// -------------------------------------------------------------
async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    if (data.authenticated && data.user) {
      state.isAuthenticated = true;
      state.user = data.user;
      state.profile = data.profile || {};
      showAppView();
    } else {
      state.isAuthenticated = false;
      state.user = null;
      state.profile = null;
      showAuthView();
    }
  } catch (err) {
    console.warn('Session verification check failed:', err);
    state.isAuthenticated = false;
    showAuthView();
  }
}

function showAuthView() {
  const authView = document.getElementById('auth-view');
  const appView = document.getElementById('app-view');
  if (authView) authView.classList.remove('hidden');
  if (appView) appView.classList.add('hidden');
  switchAuthMode('login');
  initLucide();
}

function showAppView() {
  const authView = document.getElementById('auth-view');
  const appView = document.getElementById('app-view');
  if (authView) authView.classList.add('hidden');
  if (appView) appView.classList.remove('hidden');
  initLucide();
}

function switchAuthMode(mode) {
  const loginContainer = document.getElementById('login-container');
  const signupContainer = document.getElementById('signup-container');
  const loginErr = document.getElementById('login-error-msg');
  const signupErr = document.getElementById('signup-error-msg');

  if (loginErr) loginErr.classList.add('hidden');
  if (signupErr) signupErr.classList.add('hidden');

  if (mode === 'signup') {
    loginContainer?.classList.add('hidden');
    signupContainer?.classList.remove('hidden');
  } else {
    signupContainer?.classList.add('hidden');
    loginContainer?.classList.remove('hidden');
  }
  initLucide();
}

function togglePasswordVisibility(inputId, iconId) {
  const input = document.getElementById(inputId);
  const icon = document.getElementById(iconId);
  if (!input) return;

  if (input.type === 'password') {
    input.type = 'text';
    if (icon) icon.setAttribute('data-lucide', 'eye-off');
  } else {
    input.type = 'password';
    if (icon) icon.setAttribute('data-lucide', 'eye');
  }
  initLucide();
}

function showForgotPasswordModal() {
  showToast('Password reset: Please contact your system administrator or register a new account.', 'info');
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  const emailInput = document.getElementById('login-email');
  const passwordInput = document.getElementById('login-password');
  const errorMsg = document.getElementById('login-error-msg');
  const submitBtn = document.getElementById('login-submit-btn');

  const email = emailInput?.value?.trim() || '';
  const password = passwordInput?.value || '';

  if (!email || !password) {
    if (errorMsg) {
      errorMsg.textContent = 'Please enter both email and password.';
      errorMsg.classList.remove('hidden');
    }
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></span> Signing In...`;
  }
  if (errorMsg) errorMsg.classList.add('hidden');

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();

    if (res.ok && data.success) {
      state.isAuthenticated = true;
      state.user = data.user;
      state.profile = data.profile || {};

      showAppView();
      await fetchAppConfig();
      initLucide();
      setupEventListeners();
      setupSpeechRecognition();
      loadHistory();
      updateUIFromProfile();
      setVoiceState('ready', 'Ready to speak');
      updateOnlineStatus();

      showToast(`Welcome back, ${data.user.name}!`, 'success');
    } else {
      if (errorMsg) {
        errorMsg.textContent = data.error || 'Invalid email or password.';
        errorMsg.classList.remove('hidden');
      }
    }
  } catch (err) {
    console.error('Sign in request error:', err);
    if (errorMsg) {
      errorMsg.textContent = 'Connection error. Please try again.';
      errorMsg.classList.remove('hidden');
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<span>Sign In</span>`;
    }
  }
}

async function handleSignupSubmit(event) {
  event.preventDefault();
  const nameInput = document.getElementById('signup-name');
  const emailInput = document.getElementById('signup-email');
  const passwordInput = document.getElementById('signup-password');
  const confirmPasswordInput = document.getElementById('signup-confirm-password');
  const errorMsg = document.getElementById('signup-error-msg');
  const submitBtn = document.getElementById('signup-submit-btn');

  const name = nameInput?.value?.trim() || '';
  const email = emailInput?.value?.trim() || '';
  const password = passwordInput?.value || '';
  const confirm_password = confirmPasswordInput?.value || '';

  if (password !== confirm_password) {
    if (errorMsg) {
      errorMsg.textContent = 'Passwords do not match.';
      errorMsg.classList.remove('hidden');
    }
    return;
  }

  if (password.length < 6) {
    if (errorMsg) {
      errorMsg.textContent = 'Password must be at least 6 characters.';
      errorMsg.classList.remove('hidden');
    }
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></span> Creating Account...`;
  }
  if (errorMsg) errorMsg.classList.add('hidden');

  try {
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, confirm_password })
    });
    const data = await res.json();

    if (res.ok && data.success) {
      state.isAuthenticated = true;
      state.user = data.user;
      state.profile = data.profile || {};

      showAppView();
      await fetchAppConfig();
      initLucide();
      setupEventListeners();
      setupSpeechRecognition();
      loadHistory();
      updateUIFromProfile();
      setVoiceState('ready', 'Ready to speak');
      updateOnlineStatus();

      showToast(`Account created! Welcome, ${data.user.name}!`, 'success');
    } else {
      if (errorMsg) {
        errorMsg.textContent = data.error || 'Failed to create account.';
        errorMsg.classList.remove('hidden');
      }
    }
  } catch (err) {
    console.error('Sign up request error:', err);
    if (errorMsg) {
      errorMsg.textContent = 'Connection error. Please try again.';
      errorMsg.classList.remove('hidden');
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<span>Create Account</span>`;
    }
  }
}

async function handleLogout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch (err) {
    console.warn('Logout API error:', err);
  }
  closeProfileModal();
  state.isAuthenticated = false;
  state.user = null;
  state.profile = null;
  showAuthView();
  showToast('You have been signed out.', 'info');
}

// -------------------------------------------------------------
// 3. System Configuration & Dynamic Health Indicator
// -------------------------------------------------------------
async function fetchAppConfig() {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    state.config = data;
    if (data.profile) state.profile = data.profile;
    if (data.user) state.user = data.user;

    // Populate dropdowns & pills
    populateLanguageSelects();
    populateTonePills();
    populateProfileModalFields();
  } catch (err) {
    console.error('Failed to load configuration:', err);
    showToast('Failed to load system config', 'error');
  }
}

async function updateOnlineStatus() {
  const badge = document.getElementById('engine-status-badge');
  const dot = document.getElementById('engine-status-dot');
  const text = document.getElementById('engine-status-text');
  if (!badge || !dot || !text) return;

  // 1. Browser offline state
  if (!navigator.onLine) {
    text.textContent = 'Offline';
    dot.className = 'w-2 h-2 rounded-full bg-[#64748B]';
    badge.className = 'flex items-center space-x-2 px-2.5 py-1.5 rounded-lg bg-[#0F1422] border border-[#263149] text-xs font-medium text-[#94A3B8]';
    badge.title = 'No internet connection detected';
    return;
  }

  // 2. Dynamic server & AI connection health check
  try {
    const res = await fetch('/api/health');
    const data = await res.json();

    if (res.ok && data.status === 'online') {
      if (state.profile?.has_custom_key) {
        text.textContent = 'Custom Gemini Key · Online';
      } else {
        text.textContent = 'Gemini 3.8 Flash · Online';
      }
      dot.className = 'w-2 h-2 rounded-full bg-[#22C55E]';
      badge.className = 'flex items-center space-x-2 px-2.5 py-1.5 rounded-lg bg-[#0F1422] border border-[#263149] text-xs font-medium text-[#F8FAFC]';
      badge.title = 'Gemini AI service connected and ready';
    } else {
      text.textContent = 'Translation service unavailable';
      dot.className = 'w-2 h-2 rounded-full bg-[#EF4444]';
      badge.className = 'flex items-center space-x-2 px-2.5 py-1.5 rounded-lg bg-[#0F1422] border border-[#EF4444]/30 text-xs font-medium text-[#EF4444]';
      badge.title = 'AI translation backend unavailable';
    }
  } catch (err) {
    text.textContent = 'Translation service unavailable';
    dot.className = 'w-2 h-2 rounded-full bg-[#EF4444]';
    badge.className = 'flex items-center space-x-2 px-2.5 py-1.5 rounded-lg bg-[#0F1422] border border-[#EF4444]/30 text-xs font-medium text-[#EF4444]';
    badge.title = 'Could not reach server';
  }
}

function updateUIFromProfile() {
  if (!state.profile && !state.user) return;

  // Update header avatar & authenticated user name
  const navAvatar = document.getElementById('nav-avatar');
  const navUsername = document.getElementById('nav-username');
  const avatarKey = state.profile?.avatar || state.user?.avatar || 'astronaut';
  const emoji = AVATAR_MAP[avatarKey] || '🚀';
  const displayName = state.user?.name || state.profile?.name || 'User';

  if (navAvatar) navAvatar.textContent = emoji;
  if (navUsername) navUsername.textContent = displayName;

  // Update email in profile modal
  const profileEmail = document.getElementById('profile-email-display');
  if (profileEmail) {
    profileEmail.value = state.user?.email || '';
  }

  // Update default languages if not manually changed
  state.sourceLang = state.profile?.native_language || 'auto';
  state.targetLang = state.profile?.default_target || 'es';
  state.activeTone = state.profile?.tone || 'natural';

  const srcSelect = document.getElementById('source-lang-select');
  const tgtSelect = document.getElementById('target-lang-select');
  if (srcSelect) srcSelect.value = state.sourceLang;
  if (tgtSelect) tgtSelect.value = state.targetLang;

  // Highlight active tone
  highlightActiveTonePill();

  // Sync auto-speak controls
  updateAutoSpeakButtonsUI(Boolean(state.profile?.auto_speak));
}

// -------------------------------------------------------------
// 4. Language Selectors & Tone Configuration
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

  if (tgtSelect) tgtSelect.value = state.targetLang || 'es';
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
    const isActive = t.id === state.activeTone;
    btn.className = `tone-pill px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
      isActive
        ? 'active bg-[#4F8CFF]/15 border-[#4F8CFF] text-[#4F8CFF] shadow-sm shadow-[#4F8CFF]/20'
        : 'border-[#263149] bg-[#0F1422] text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#172033]'
    }`;
    btn.setAttribute('data-tone-id', t.id);
    btn.innerHTML = `<span class="flex items-center space-x-1.5"><span class="w-1.5 h-1.5 rounded-full ${isActive ? 'bg-[#4F8CFF]' : 'bg-[#64748B]'} tone-dot mr-1"></span><span>${t.name}</span></span>`;
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
  const input = document.getElementById('source-input')?.value?.trim();
  if (input) {
    triggerTranslation();
  }
}

function highlightActiveTonePill() {
  document.querySelectorAll('.tone-pill').forEach(btn => {
    const isActive = btn.getAttribute('data-tone-id') === state.activeTone;
    btn.classList.toggle('active', isActive);
    btn.className = `tone-pill px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
      isActive
        ? 'active bg-[#4F8CFF]/15 border-[#4F8CFF] text-[#4F8CFF] shadow-sm shadow-[#4F8CFF]/20'
        : 'border-[#263149] bg-[#0F1422] text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#172033]'
    }`;
    const dot = btn.querySelector('.tone-dot');
    if (dot) {
      dot.className = `w-1.5 h-1.5 rounded-full ${isActive ? 'bg-[#4F8CFF]' : 'bg-[#64748B]'} tone-dot mr-1`;
    }
  });
}

// -------------------------------------------------------------
// 5. Event Listeners & Keyboard Shortcuts
// -------------------------------------------------------------
function setupEventListeners() {
  const sourceInput = document.getElementById('source-input');
  if (sourceInput) {
    sourceInput.addEventListener('input', () => {
      updateSourceCharAndWordCount();
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
    // Escape: Cancel active speech recognition or close drawer/modals
    if (e.key === 'Escape') {
      if (state.isListening) {
        stopMicrophone();
        setVoiceState('ready', 'Speech cancelled');
      }
      closeProfileModal();
      const drawer = document.getElementById('history-drawer');
      if (drawer && !drawer.classList.contains('translate-x-full')) {
        toggleHistoryDrawer();
      }
    }

    // Ctrl + S: Swap languages in Translate mode
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && state.activeMode === 'translate') {
      e.preventDefault();
      swapLanguages();
    }

    // Space: Toggle microphone when not typing in an input/textarea
    if (e.code === 'Space' && document.activeElement.tagName !== 'TEXTAREA' && document.activeElement.tagName !== 'INPUT') {
      e.preventDefault();
      toggleMicrophone();
    }
  });
}

function updateSourceCharAndWordCount() {
  const input = document.getElementById('source-input');
  const text = input ? input.value : '';
  const chars = text.length;
  const words = text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0;
  const counter = document.getElementById('source-char-count');
  if (counter) {
    counter.textContent = `${words} word${words === 1 ? '' : 's'} • ${chars} char${chars === 1 ? '' : 's'}`;
  }
  const clearBtn = document.getElementById('clear-input-btn');
  if (clearBtn) clearBtn.classList.toggle('hidden', chars === 0);
}

// -------------------------------------------------------------
// 6. Mode Switching
// -------------------------------------------------------------
function switchMode(mode) {
  state.activeMode = mode;

  stopMicrophone();
  if (state.continuousVoiceActive) {
    toggleContinuousVoice();
  }

  document.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
  const activeTab = document.getElementById(`nav-mode-${mode}`);
  if (activeTab) activeTab.classList.add('active');

  document.getElementById('view-translate').classList.toggle('hidden', mode !== 'translate');
  document.getElementById('view-dialogue').classList.toggle('hidden', mode !== 'dialogue');
  document.getElementById('view-voice').classList.toggle('hidden', mode !== 'voice');

  initLucide();
}

// -------------------------------------------------------------
// 7. Translation Logic (With Offline Safeguards)
// -------------------------------------------------------------
async function triggerTranslation(customText = null, overrideTarget = null, overrideSource = null) {
  // Offline verification
  if (!navigator.onLine) {
    showToast("You're offline. Reconnect to the internet to use Gemini translation.", 'error');
    setVoiceState('error', 'Offline - No connection');
    const container = document.getElementById('target-text-container');
    if (container) {
      container.innerHTML = `
        <div class="p-4 rounded-xl bg-[#0F1422] border border-[#F59E0B]/30 text-[#F59E0B] text-xs space-y-1">
          <p class="font-bold flex items-center"><i data-lucide="wifi-off" class="w-4 h-4 mr-1.5"></i> You're offline</p>
          <p class="text-[#94A3B8]">Please reconnect to the internet to perform real-time AI translations.</p>
        </div>
      `;
      initLucide();
    }
    return;
  }

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

  setTranslationLoading(true);
  setVoiceState('processing', 'Translating with Gemini AI...');

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
        save_history: true
      })
    });

    if (res.status === 401) {
      setTranslationLoading(false);
      showToast('Session expired. Please sign in again.', 'error');
      showAuthView();
      return;
    }

    const data = await res.json();
    setTranslationLoading(false);

    if (data.success) {
      state.currentTranslation = data;
      state.currentHistoryId = data.history_id;
      renderTranslationResult(data);

      if (state.profile?.auto_speak) {
        speakText(data.translated_text, targetLang);
      }

      loadHistory();
    } else {
      setVoiceState('error', 'Translation failed');
      showToast(data.error || 'Translation failed', 'error');
    }
  } catch (err) {
    setTranslationLoading(false);
    setVoiceState('error', 'Network error');
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
    container.innerHTML = `<p class="select-text whitespace-pre-wrap">${escapeHtml(data.translated_text)}</p>`;
    container.classList.remove('opacity-40');
  }

  // Phonetic pronunciation
  if (data.pronunciation && data.pronunciation.trim()) {
    if (pronText) pronText.textContent = data.pronunciation;
    pronCard?.classList.remove('hidden');
  } else {
    pronCard?.classList.add('hidden');
  }

  // Linguistic & cultural nuance note
  if (data.nuance_note && data.nuance_note.trim()) {
    if (nuanceText) nuanceText.textContent = data.nuance_note;
    nuanceCard?.classList.remove('hidden');
  } else {
    nuanceCard?.classList.add('hidden');
  }

  // Engine model badge
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
    starIcon.classList.remove('fill-[#F59E0B]', 'text-[#F59E0B]');
    starIcon.classList.add('text-[#94A3B8]');
  }

  setVoiceState('success', 'Translation ready');
  initLucide();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function clearSourceInput() {
  const input = document.getElementById('source-input');
  if (input) {
    input.value = '';
    updateSourceCharAndWordCount();
    document.getElementById('detected-lang-pill')?.classList.add('hidden');
    input.focus();
  }

  // Reset target card to modern empty state
  state.currentTranslation = null;
  state.currentHistoryId = null;
  const container = document.getElementById('target-text-container');
  if (container) {
    container.innerHTML = `
      <div id="target-empty-state" class="h-full flex flex-col items-center justify-center text-center py-8 text-[#64748B]">
        <div class="w-12 h-12 rounded-2xl bg-[#0F1422] border border-[#263149] flex items-center justify-center mb-3">
          <i data-lucide="globe-2" class="w-6 h-6 text-[#4F8CFF]/60"></i>
        </div>
        <p class="text-sm font-semibold text-[#94A3B8]">Translation</p>
        <p class="text-xs text-[#64748B] mt-1">Your translation will appear here.</p>
        <p class="text-[11px] text-[#64748B] mt-0.5">Type, speak, or upload audio to begin.</p>
      </div>
    `;
    initLucide();
  }
  document.getElementById('pronunciation-card')?.classList.add('hidden');
  document.getElementById('nuance-card')?.classList.add('hidden');
  setVoiceState('ready', 'Ready to speak');
}

function swapLanguages() {
  const src = document.getElementById('source-lang-select');
  const tgt = document.getElementById('target-lang-select');
  const sourceInput = document.getElementById('source-input');
  const currentTranslationText = state.currentTranslation?.translated_text;

  const currentSrc = src.value;
  const currentTgt = tgt.value;

  if (currentSrc === 'auto') {
    // If source is Auto Detect, safely swap using detected language if known
    let targetCandidate = 'en';
    const detected = state.currentTranslation?.detected_source_lang;
    if (detected) {
      const match = state.config?.languages?.find(l => 
        l.code.toLowerCase() === detected.toLowerCase() || 
        l.name.toLowerCase().includes(detected.toLowerCase())
      );
      if (match && match.code !== 'auto') {
        targetCandidate = match.code;
      }
    } else {
      targetCandidate = (currentTgt === 'en') ? 'es' : (state.profile?.native_language || 'en');
    }

    src.value = currentTgt;
    tgt.value = targetCandidate;
  } else {
    // Standard swap
    src.value = currentTgt;
    tgt.value = currentSrc;
  }

  state.sourceLang = src.value;
  state.targetLang = tgt.value;

  // Swap text if translation exists
  if (currentTranslationText && sourceInput) {
    sourceInput.value = currentTranslationText;
    updateSourceCharAndWordCount();
    document.getElementById('clear-input-btn')?.classList.remove('hidden');
    triggerTranslation();
  }
}

function handleSourceLangChange() {
  state.sourceLang = document.getElementById('source-lang-select').value;
}

function handleTargetLangChange() {
  state.targetLang = document.getElementById('target-lang-select').value;
  const input = document.getElementById('source-input')?.value?.trim();
  if (input) triggerTranslation();
}

// -------------------------------------------------------------
// 8. Voice Interaction States & Web Audio Visualizer
// -------------------------------------------------------------
function setVoiceState(status, message) {
  const pill = document.getElementById('voice-state-pill');
  const waveformBox = document.getElementById('mic-waveform-container');

  if (!pill) return;

  if (voiceStateTimeout) {
    clearTimeout(voiceStateTimeout);
    voiceStateTimeout = null;
  }

  pill.className = 'voice-state-badge';

  switch (status) {
    case 'listening':
      pill.classList.add('voice-state-listening');
      pill.innerHTML = `
        <span class="w-2 h-2 rounded-full bg-[#EF4444] animate-ping"></span>
        <span id="voice-state-text">${message || 'Listening... Speak now'}</span>
      `;
      if (waveformBox) waveformBox.classList.remove('hidden');
      break;

    case 'processing':
      pill.classList.add('voice-state-processing');
      pill.innerHTML = `
        <span class="w-3 h-3 rounded-full border-2 border-[#4F8CFF] border-t-transparent animate-spin inline-block"></span>
        <span id="voice-state-text">${message || 'Translating with Gemini AI...'}</span>
      `;
      if (waveformBox) waveformBox.classList.add('hidden');
      break;

    case 'success':
      pill.classList.add('voice-state-success');
      pill.innerHTML = `
        <i data-lucide="check-circle" class="w-3.5 h-3.5 text-[#22C55E]"></i>
        <span id="voice-state-text">${message || 'Translation ready'}</span>
      `;
      if (waveformBox) waveformBox.classList.add('hidden');
      initLucide();
      voiceStateTimeout = setTimeout(() => {
        setVoiceState('ready', 'Ready to speak');
      }, 3500);
      break;

    case 'error':
      pill.classList.add('voice-state-error');
      pill.innerHTML = `
        <i data-lucide="alert-circle" class="w-3.5 h-3.5 text-[#EF4444]"></i>
        <span id="voice-state-text">${message || 'Microphone error'}</span>
      `;
      if (waveformBox) waveformBox.classList.add('hidden');
      initLucide();
      voiceStateTimeout = setTimeout(() => {
        setVoiceState('ready', 'Ready to speak');
      }, 4000);
      break;

    case 'ready':
    default:
      pill.classList.add('voice-state-ready');
      pill.innerHTML = `
        <span class="w-2 h-2 rounded-full bg-[#64748B]"></span>
        <span id="voice-state-text">${message || 'Ready to speak'}</span>
      `;
      if (waveformBox) waveformBox.classList.add('hidden');
      break;
  }
}

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
    setVoiceState('listening', 'Listening... Speak now');
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
        updateSourceCharAndWordCount();
      }
    } else if (state.activeMode === 'dialogue') {
      state.dialogueCurrentText = currentText;
    } else if (state.activeMode === 'voice') {
      const studioText = document.getElementById('studio-transcript');
      if (studioText) studioText.textContent = currentText;
    }
  };

  recognition.onerror = (event) => {
    console.warn('Speech recognition error:', event.error);
    setVoiceState('error', event.error === 'no-speech' ? 'No speech detected' : 'Microphone error');
    stopMicrophone();
  };

  recognition.onend = () => {
    state.isListening = false;
    updateMicButtonUI(false);
    stopVisualizer();

    if (state.activeMode === 'translate') {
      const text = document.getElementById('source-input')?.value?.trim();
      if (text) {
        setVoiceState('processing', 'Translating with Gemini AI...');
        triggerTranslation();
      } else {
        setVoiceState('ready', 'Ready to speak');
      }
    } else if (state.activeMode === 'dialogue') {
      handleDialogueUtteranceFinished();
    } else if (state.activeMode === 'voice' && state.continuousVoiceActive) {
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
    setVoiceState('error', 'Speech recognition unsupported');
    return;
  }

  let langCode = state.sourceLang;
  if (langCode === 'auto') {
    langCode = state.profile?.native_language || 'en';
  }

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
  const text = document.getElementById('mic-btn-text');

  if (isRecording) {
    if (btn) {
      btn.className = 'px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center space-x-2 cursor-pointer bg-[#EF4444] hover:bg-[#EF4444]/90 text-white shadow-lg shadow-[#EF4444]/30 ring-2 ring-[#EF4444]/50 animate-pulse';
    }
    if (text) text.textContent = 'Listening...';
  } else {
    if (btn) {
      btn.className = 'btn-primary px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center space-x-2 group cursor-pointer';
    }
    if (text) text.textContent = 'Speak';
  }
}

// -------------------------------------------------------------
// 9. Web Audio Waveform Visualizer (Electric Blue & Cyan Palette)
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

      if (canvas.width !== canvas.clientWidth) canvas.width = canvas.clientWidth || 300;
      if (canvas.height !== canvas.clientHeight) canvas.height = canvas.clientHeight || 28;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const barCount = bufferLength;
      const barWidth = (canvas.width / barCount) * 1.8;
      let x = 0;

      for (let i = 0; i < barCount; i++) {
        const barHeight = Math.max(3, (dataArray[i] / 255) * canvas.height);
        const y = (canvas.height - barHeight) / 2;

        const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
        gradient.addColorStop(0, '#22D3EE'); // Cyan
        gradient.addColorStop(1, '#4F8CFF'); // Electric Blue

        ctx.fillStyle = gradient;
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(x, y, Math.max(2, barWidth - 2), barHeight, 2);
        } else {
          ctx.rect(x, y, Math.max(2, barWidth - 2), barHeight);
        }
        ctx.fill();

        x += barWidth + 1.5;
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
// 10. Text-to-Speech (TTS) & Auto-Speak
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

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);

  utterance.rate = state.profile?.speech_rate || 1.0;
  utterance.pitch = 1.0;

  const voices = window.speechSynthesis.getVoices();
  const simpleLang = langCode.split('-')[0].toLowerCase();
  const matchedVoice = voices.find(v => v.lang.toLowerCase().startsWith(simpleLang));
  if (matchedVoice) {
    utterance.voice = matchedVoice;
  }

  const icon = document.getElementById('speak-target-icon');
  if (icon) icon.classList.add('text-[#4F8CFF]', 'animate-pulse');

  utterance.onend = () => {
    if (icon) icon.classList.remove('text-[#4F8CFF]', 'animate-pulse');
  };

  utterance.onerror = () => {
    if (icon) icon.classList.remove('text-[#4F8CFF]', 'animate-pulse');
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

async function toggleAutoSpeak() {
  const current = Boolean(state.profile?.auto_speak);
  const nextState = !current;
  if (!state.profile) state.profile = {};
  state.profile.auto_speak = nextState;

  updateAutoSpeakButtonsUI(nextState);

  try {
    await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...state.profile, auto_speak: nextState })
    });
    showToast(nextState ? 'Auto-Speak enabled' : 'Auto-Speak disabled', 'info');
  } catch (err) {
    console.warn('Failed to persist auto-speak toggle:', err);
  }
}

function updateAutoSpeakButtonsUI(isActive) {
  const btn = document.getElementById('auto-speak-quick-btn');
  const icon = document.getElementById('auto-speak-quick-icon');
  const text = document.getElementById('auto-speak-quick-text');
  const modalCheckbox = document.getElementById('profile-autospeak-toggle');

  if (btn) {
    btn.className = `auto-speak-btn ${isActive ? 'active' : 'inactive'} px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 cursor-pointer`;
  }
  if (icon) {
    icon.setAttribute('data-lucide', isActive ? 'volume-check' : 'volume-x');
  }
  if (text) {
    text.textContent = isActive ? 'Auto-Speak: On' : 'Auto-Speak: Off';
  }
  if (modalCheckbox) {
    modalCheckbox.checked = isActive;
  }
  initLucide();
}

// -------------------------------------------------------------
// 11. Two-Way Conversation / Dialogue Mode
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
      micBtn?.classList.add('animate-pulse', 'ring-4', 'ring-[#4F8CFF]/50');
    } catch(e) {}
  }
}

async function handleDialogueUtteranceFinished() {
  const text = state.dialogueCurrentText?.trim();
  state.dialogueCurrentText = '';
  document.querySelectorAll('[id^="dialogue-mic-"]').forEach(btn => btn.classList.remove('animate-pulse', 'ring-4', 'ring-[#4F8CFF]/50'));

  if (!text) return;

  const speaker = state.dialogueSpeaker;
  const lang1 = document.getElementById('dialogue-lang-1').value;
  const lang2 = document.getElementById('dialogue-lang-2').value;

  const srcLang = speaker === 1 ? lang1 : lang2;
  const tgtLang = speaker === 1 ? lang2 : lang1;

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
      <div class="flex items-center space-x-2 mb-1 text-[11px] font-bold ${isSpeaker1 ? 'text-[#4F8CFF]' : 'text-[#22D3EE]'}">
        <span>${isSpeaker1 ? 'Speaker 1' : 'Speaker 2'}</span>
      </div>
      <p class="text-xs text-[#94A3B8] mb-1.5 opacity-90">${escapeHtml(originalText)}</p>
      <div class="border-t border-[#263149] pt-1.5">
        <p class="text-sm font-semibold text-[#F8FAFC] dialogue-translated-text">${escapeHtml(translatedPlaceholder)}</p>
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
      <div class="text-center py-10 text-[#64748B] text-xs">
        <div class="w-12 h-12 rounded-2xl bg-[#0F1422] border border-[#263149] flex items-center justify-center mx-auto mb-3">
          <i data-lucide="mic-2" class="w-6 h-6 text-[#4F8CFF]/60"></i>
        </div>
        <p class="font-medium text-[#94A3B8]">Chat cleared. Tap either speaker's microphone to start talking.</p>
      </div>
    `;
    initLucide();
  }
}

// -------------------------------------------------------------
// 12. Voice Studio Mode
// -------------------------------------------------------------
function toggleContinuousVoice() {
  state.continuousVoiceActive = !state.continuousVoiceActive;
  const btn = document.getElementById('continuous-voice-btn');
  const label = document.getElementById('cont-voice-label');
  const icon = document.getElementById('cont-voice-icon');
  const statusPill = document.getElementById('studio-status-pill');

  if (state.continuousVoiceActive) {
    btn.className = 'px-6 py-3 rounded-2xl text-sm font-bold flex items-center space-x-2 bg-[#EF4444] hover:bg-[#EF4444]/90 text-white shadow-lg shadow-[#EF4444]/30';
    label.textContent = 'Stop Listening';
    icon.setAttribute('data-lucide', 'square');
    statusPill.textContent = 'Listening Live';
    statusPill.className = 'text-[#EF4444] font-mono text-[11px] animate-pulse';
    startMicrophone();
  } else {
    btn.className = 'btn-primary px-6 py-3 rounded-2xl text-sm font-bold flex items-center space-x-2';
    label.textContent = 'Start Continuous Listening';
    icon.setAttribute('data-lucide', 'play');
    statusPill.textContent = 'Ready';
    statusPill.className = 'text-[#22C55E] font-mono text-[11px]';
    stopMicrophone();
  }
  initLucide();
}

// -------------------------------------------------------------
// 13. History & Saved Translations
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
      <div class="text-center py-10 text-[#64748B] text-xs">
        <i data-lucide="inbox" class="w-8 h-8 mx-auto mb-2 text-[#64748B]"></i>
        <p>No history entries found.</p>
      </div>
    `;
    initLucide();
    return;
  }

  items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'p-3 rounded-xl bg-[#121827] hover:bg-[#172033] border border-[#263149] transition-all text-xs space-y-1.5 relative group';
    card.innerHTML = `
      <div class="flex items-center justify-between text-[10px] text-[#94A3B8]">
        <span class="font-mono text-[#22D3EE]">${item.source_lang.toUpperCase()} → ${item.target_lang.toUpperCase()}</span>
        <div class="flex items-center space-x-1.5">
          <button onclick="toggleHistoryItemStar(${item.id})" class="p-1 hover:text-[#F59E0B] ${item.is_favorite ? 'text-[#F59E0B]' : 'text-[#64748B]'}">
            <i data-lucide="star" class="w-3.5 h-3.5 ${item.is_favorite ? 'fill-[#F59E0B]' : ''}"></i>
          </button>
          <button onclick="deleteHistoryItem(${item.id})" class="p-1 hover:text-[#EF4444] text-[#64748B]">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </div>
      <p class="text-[#94A3B8] line-clamp-2 cursor-pointer" onclick="recallHistory(${item.id})">${escapeHtml(item.source_text)}</p>
      <p class="font-semibold text-[#F8FAFC] line-clamp-2 cursor-pointer" onclick="recallHistory(${item.id})">${escapeHtml(item.translated_text)}</p>
      ${item.pronunciation ? `<p class="text-[11px] font-mono text-[#22D3EE]/80 truncate">🔊 ${escapeHtml(item.pronunciation)}</p>` : ''}
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

  if (srcInput) {
    srcInput.value = item.source_text;
    updateSourceCharAndWordCount();
  }
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
    const isFav = icon.classList.contains('fill-[#F59E0B]');
    icon.classList.toggle('fill-[#F59E0B]', !isFav);
    icon.classList.toggle('text-[#F59E0B]', !isFav);
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
  document.getElementById('hist-tab-all').className = tab === 'all' ? 'px-2.5 py-1 rounded-lg bg-[#4F8CFF]/20 text-[#4F8CFF] font-semibold' : 'px-2.5 py-1 rounded-lg bg-[#121827] text-[#94A3B8] hover:text-[#F8FAFC]';
  document.getElementById('hist-tab-starred').className = tab === 'starred' ? 'px-2.5 py-1 rounded-lg bg-[#4F8CFF]/20 text-[#4F8CFF] font-semibold' : 'px-2.5 py-1 rounded-lg bg-[#121827] text-[#94A3B8] hover:text-[#F8FAFC]';
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
// 14. Profile & Preferences Modal (Organized Sections)
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
  const nameInput = document.getElementById('profile-name-input');
  const emailDisplay = document.getElementById('profile-email-display');
  const keyInput = document.getElementById('profile-api-key-input');
  const autoSpeakToggle = document.getElementById('profile-autospeak-toggle');
  const speechRateSlider = document.getElementById('profile-speech-rate');
  const rateLabel = document.getElementById('speech-rate-label');
  const nativeSelect = document.getElementById('profile-native-lang');
  const targetSelect = document.getElementById('profile-target-lang');
  const toneSelect = document.getElementById('profile-tone-select');
  const keyStatus = document.getElementById('profile-key-status');

  if (nameInput) nameInput.value = state.user?.name || state.profile?.name || '';
  if (emailDisplay) emailDisplay.value = state.user?.email || '';
  if (keyInput) keyInput.value = state.profile?.custom_api_key || '';
  if (autoSpeakToggle) autoSpeakToggle.checked = Boolean(state.profile?.auto_speak);
  if (speechRateSlider) speechRateSlider.value = state.profile?.speech_rate || 1.0;
  if (rateLabel) rateLabel.textContent = `${state.profile?.speech_rate || 1.0}x`;
  if (nativeSelect) nativeSelect.value = state.profile?.native_language || 'en';
  if (targetSelect) targetSelect.value = state.profile?.default_target || 'es';
  if (toneSelect) toneSelect.value = state.profile?.tone || 'natural';

  const avatarKey = state.profile?.avatar || state.user?.avatar || 'astronaut';
  selectAvatar(avatarKey, AVATAR_MAP[avatarKey] || '🚀');

  if (keyStatus) {
    if (state.profile?.has_custom_key) {
      keyStatus.textContent = 'Custom Key Configured';
      keyStatus.className = 'text-[11px] font-mono px-2 py-0.5 rounded-md bg-[#4F8CFF]/15 text-[#4F8CFF]';
    } else if (state.config?.env_key_present) {
      keyStatus.textContent = 'System Gemini 3.8 Active';
      keyStatus.className = 'text-[11px] font-mono px-2 py-0.5 rounded-md bg-[#22C55E]/15 text-[#22C55E]';
    } else {
      keyStatus.textContent = 'No Key Configured';
      keyStatus.className = 'text-[11px] font-mono px-2 py-0.5 rounded-md bg-[#F59E0B]/15 text-[#F59E0B]';
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
  btn.innerHTML = `<span class="animate-spin inline-block w-3.5 h-3.5 border-2 border-[#4F8CFF] border-t-transparent rounded-full mr-1"></span> Testing...`;

  try {
    const res = await fetch('/api/test-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: key })
    });
    const data = await res.json();
    btn.innerHTML = `<i data-lucide="shield-check" class="w-3.5 h-3.5 mr-1 text-[#22D3EE]"></i> Test Connection`;
    initLucide();

    if (data.valid) {
      showToast(`Connection Verified: ${data.message}`, 'success');
      updateOnlineStatus();
    } else {
      showToast(`Key Error: ${data.message}`, 'error');
    }
  } catch (err) {
    btn.innerHTML = `<i data-lucide="shield-check" class="w-3.5 h-3.5 mr-1 text-[#22D3EE]"></i> Test Connection`;
    initLucide();
    showToast('Failed to reach validation service', 'error');
  }
}

async function saveProfileChanges() {
  const updatedData = {
    name: document.getElementById('profile-name-input')?.value?.trim() || state.user?.name || 'User',
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
      if (state.user) {
        state.user.name = updatedData.name;
        state.user.avatar = updatedData.avatar;
      }
      updateUIFromProfile();
      updateOnlineStatus();
      closeProfileModal();
      showToast('Profile and preferences updated successfully!', 'success');
    }
  } catch (err) {
    console.error('Failed to save profile:', err);
    showToast('Failed to save profile', 'error');
  }
}

// -------------------------------------------------------------
// 15. File Audio Upload
// -------------------------------------------------------------
async function handleAudioUpload(inputElem) {
  if (!inputElem.files || !inputElem.files[0]) return;
  const file = inputElem.files[0];
  const formData = new FormData();
  formData.append('audio', file);
  formData.append('lang', state.sourceLang === 'auto' ? 'en-US' : state.sourceLang);

  showToast(`Uploading ${file.name} for speech transcription...`, 'info');
  setVoiceState('processing', 'Transcribing audio file...');

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
        updateSourceCharAndWordCount();
        document.getElementById('clear-input-btn')?.classList.remove('hidden');
      }
      showToast('Audio transcribed successfully!', 'success');
      triggerTranslation();
    } else {
      setVoiceState('error', 'Transcription failed');
      showToast(data.error || 'Audio transcription failed', 'error');
    }
  } catch (err) {
    setVoiceState('error', 'Audio upload failed');
    showToast('Failed to upload/transcribe audio', 'error');
  }
  inputElem.value = '';
}

// -------------------------------------------------------------
// 16. Clipboard & Toast Notifications
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
    const copyBtnText = document.getElementById('copy-btn-text');
    if (copyIcon) {
      copyIcon.setAttribute('data-lucide', 'check');
    }
    if (copyBtnText) {
      copyBtnText.textContent = 'Copied!';
    }
    initLucide();
    setTimeout(() => {
      if (copyIcon) copyIcon.setAttribute('data-lucide', 'copy');
      if (copyBtnText) copyBtnText.textContent = 'Copy';
      initLucide();
    }, 2000);
  });
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  const bgStyles = {
    success: 'bg-[#0F1422] border-[#22C55E]/40 text-[#22C55E]',
    error: 'bg-[#0F1422] border-[#EF4444]/40 text-[#EF4444]',
    info: 'bg-[#0F1422] border-[#4F8CFF]/40 text-[#4F8CFF]',
  }[type] || 'bg-[#0F1422] border-[#263149] text-[#F8FAFC]';

  toast.className = `p-3.5 rounded-2xl border backdrop-blur-xl shadow-2xl flex items-center space-x-2 text-xs font-semibold toast-enter pointer-events-auto ${bgStyles}`;
  toast.innerHTML = `<span>${message}</span>`;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
