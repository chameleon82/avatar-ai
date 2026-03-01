import {Avatar} from './avatar/avatar.js';
import {createOutputTracker} from './avatar/visemes.js';
import {CameraStreamer} from './camera/cameraStreamer.js';
import {PCM16Audio} from './audio/pcm16Audio.js';
import {RealtimeClient} from './openai/realtimeClient.js';

let avatar = new Avatar("./src/assets/avatar-w.glb");
// let avatar = new Avatar("https://readyplayerme.github.io/visage/male.glb");
let realtimeClient = null;

// ---- Prevent device sleep while this page is open (Screen Wake Lock) ----
// Notes:
// - Requires a user gesture to activate in most browsers.
// - Only supported on some browsers (Chrome/Edge/Android). Safe no-op elsewhere.
let wakeLock = null;
let wakeLockRequested = false;

async function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    if (wakeLock) return;
    try {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => {
            wakeLock = null;
        });
    } catch (e) {
        // Usually fails if not triggered by a user gesture or if OS/browser disallows it.
        // We intentionally keep silent here.
    }
}

function setupWakeLock() {
    if (wakeLockRequested) return;
    wakeLockRequested = true;

    // Try on first user interaction
    const activate = () => {
        requestWakeLock();
        document.removeEventListener('click', activate, true);
        document.removeEventListener('keydown', activate, true);
        document.removeEventListener('touchstart', activate, true);
    };
    document.addEventListener('click', activate, true);
    document.addEventListener('keydown', activate, true);
    document.addEventListener('touchstart', activate, true);

    // Re-acquire when returning to the tab
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            // Lock is typically released when tab goes to background.
            wakeLock = null;
            requestWakeLock();
        }
    });
}

// ---- Fullscreen toggle ----
// Fullscreen also requires a user gesture.
async function toggleFullscreen() {
    try {
        const doc = document;
        const el = document.documentElement;

        const isFs = doc.fullscreenElement || doc.webkitFullscreenElement;
        if (isFs) {
            if (doc.exitFullscreen) return await doc.exitFullscreen();
            if (doc.webkitExitFullscreen) return await doc.webkitExitFullscreen();
            return;
        }

        if (el.requestFullscreen) return await el.requestFullscreen();
        if (el.webkitRequestFullscreen) return await el.webkitRequestFullscreen();
    } catch (_) {
    }
}

function updateFullscreenIcon() {
    const btn = document.getElementById('fullscreen');
    if (!btn) return;
    const icon = btn.querySelector('i');
    if (!icon) return;

    const isFs = document.fullscreenElement || document.webkitFullscreenElement;
    icon.classList.remove('fa-expand', 'fa-compress');
    icon.classList.add(isFs ? 'fa-compress' : 'fa-expand');
}

// NOTE: your realtime model must support image inputs. If you see errors, switch the model
// in the websocket URL to a vision-capable realtime model.
const camPreviewEl = document.getElementById('camPreview');
const cameraStreamer = new CameraStreamer({
    width: 128,
    height: 128,
    fps: 2,
    jpegQuality: 0.6,
    facingMode: 'user',
    previewVideoEl: camPreviewEl,
    onFrame: (dataUrl) => {
        // IMPORTANT: images are only captured while we decide “user is speaking”.
        // Still guard against realtime socket state.
        if (!realtimeClient || !realtimeClient.isOpen) return;

        // Send an image message WITHOUT requesting a response each time.
        // (Keeps bandwidth and token usage sane.)
        const evt = {
            event_id: "event_" + eventId++,
            type: "conversation.item.create",
            previous_item_id: null,
            item: {
                type: "message",
                role: "user",
                content: [
                    {
                        type: "input_image",
                        image_url: dataUrl
                    }
                ]
            }
        };
        realtimeClient.sendEvent(evt);
    },
    onError: (e) => {
        console.error('[camera] error', e);
        // If user blocks permissions, revert UI state.
        const btn = document.getElementById('cam');
        btn?.classList.remove('recording');
        cameraEnabled = false;
        stopCameraCapture();
    }
});

// Camera policy:
// - You manually enable/disable camera via the camera button.
// - When enabled, we ONLY capture/send frames while you are speaking (server VAD events).
// This avoids burning tokens while you are silent.
let cameraEnabled = false;
let cameraCapturing = false;
let cameraStopTimerId = null;
const CAMERA_TAIL_MS = 1500; // keep a tiny tail after speech stops

async function startCameraCapture() {
    if (!cameraEnabled || cameraCapturing) return;
    cameraCapturing = true;
    // Camera stays ON; only start capture (frames) here.
    await cameraStreamer.startCapture();
}

function stopCameraCapture() {
    cameraCapturing = false;
    if (cameraStopTimerId) {
        clearTimeout(cameraStopTimerId);
        cameraStopTimerId = null;
    }
    // Stop capture only (no frames, no sending), but keep webcam stream alive.
    cameraStreamer.stopCapture();
}

async function ensureCameraOn() {
    if (!cameraEnabled) return;
    if (camPreviewEl) camPreviewEl.style.display = 'block';
    await cameraStreamer.startCamera();
}


function scheduleStopCameraCapture(ms) {
    if (cameraStopTimerId) clearTimeout(cameraStopTimerId);
    cameraStopTimerId = setTimeout(() => stopCameraCapture(), ms);
}


async function init() {

    // Keep device awake while this page is used (requires user gesture to actually lock)
    setupWakeLock();

    // Fullscreen button
    const fullscreenBtn = document.getElementById('fullscreen');
    if (fullscreenBtn) {
        fullscreenBtn.addEventListener('click', async () => {
            await toggleFullscreen();
            updateFullscreenIcon();
        });
    }
    document.addEventListener('fullscreenchange', updateFullscreenIcon);
    document.addEventListener('webkitfullscreenchange', updateFullscreenIcon);
    updateFullscreenIcon();

    const inputField = document.getElementById('inputField');


    function onEnterKey(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            // Trigger the function or submit button action
            if (inputField.value !== "") {
                onUserInput(inputField.value);
                inputField.value = "";
            }
        }
    }

    inputField.addEventListener('keydown', onEnterKey);

    document.body.appendChild(avatar.renderer.domElement);
    avatar.renderer.setSize(window.innerWidth, window.innerHeight);
    window.addEventListener('resize', () => {
        avatar.renderer.setSize(window.innerWidth, window.innerHeight);
        // Update camera aspect ratio and other settings if necessary
        avatar.camera.aspect = window.innerWidth / window.innerHeight;
        avatar.camera.updateProjectionMatrix();
    });
}


// ---- Settings (no backend) ----
// Stored in localStorage under SETTINGS_KEY.
// Security note: anything stored in localStorage is readable by any JS on this origin.
const SETTINGS_KEY = 'openaiSettings';

const defaultSettings = {
    baseUrl: 'https://api.openai.com',
    model: 'gpt-realtime-mini',
    rememberKey: false,
    apiKey: '',
    customInstructions: ''
};

function loadSettings() {
    try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        if (!raw) return {...defaultSettings};
        const parsed = JSON.parse(raw);
        return {...defaultSettings, ...parsed};
    } catch (e) {
        return {...defaultSettings};
    }
}

function saveSettings(settingsObj) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settingsObj));
}

function clearSavedKey() {
    const s = loadSettings();
    s.apiKey = '';
    s.rememberKey = false;
    saveSettings(s);
}

function normalizeBaseUrl(input) {
    const trimmed = (input || '').trim();
    if (!trimmed) return defaultSettings.baseUrl;
    return trimmed;
}

function buildRealtimeWsUrl(baseUrl, model) {
    const m = (model || defaultSettings.model).trim();
    const b = normalizeBaseUrl(baseUrl);

    try {
        // Accept https://api..., http://..., ws://..., wss://...
        const u = new URL(b);
        const wsProto = (u.protocol === 'http:' || u.protocol === 'ws:') ? 'ws:' : 'wss:';
        const wsOrigin = wsProto + '//' + u.host;
        return wsOrigin + '/v1/realtime?model=' + encodeURIComponent(m);
    } catch (e) {
        // Fallback
        return 'wss://api.openai.com/v1/realtime?model=' + encodeURIComponent(m);
    }
}

// In-memory session config
let settings = loadSettings();
let openaiApiKey = settings.rememberKey ? (settings.apiKey || '') : '';

function showSettingsModal({force = false} = {}) {
    const modal = document.getElementById('modal');
    const baseUrlInput = document.getElementById('baseUrlInput');
    const modelInput = document.getElementById('modelInput');
    const apiKeyInput = document.getElementById('apiKeyInput');
    const rememberKeyEl = document.getElementById('rememberKey');
    const customInstructionsInput = document.getElementById('customInstructionsInput');

    baseUrlInput.value = settings.baseUrl || defaultSettings.baseUrl;
    modelInput.value = settings.model || defaultSettings.model;
    apiKeyInput.value = openaiApiKey || '';
    rememberKeyEl.checked = !!settings.rememberKey;
    if (customInstructionsInput) customInstructionsInput.value = settings.customInstructions || '';

    modal.dataset.force = force ? '1' : '0';
    modal.style.display = 'block';
}


function hideSettingsModal() {
    document.getElementById('modal').style.display = 'none';
}

document.getElementById('saveSettings').onclick = function () {
    const baseUrlInput = document.getElementById('baseUrlInput');
    const modelInput = document.getElementById('modelInput');
    const apiKeyInput = document.getElementById('apiKeyInput');
    const rememberKeyEl = document.getElementById('rememberKey');
    const customInstructionsInput = document.getElementById('customInstructionsInput');

    const next = {
        baseUrl: normalizeBaseUrl(baseUrlInput.value),
        model: (modelInput.value || defaultSettings.model).trim(),
        rememberKey: !!rememberKeyEl.checked,
        apiKey: '',
        customInstructions: (customInstructionsInput ? (customInstructionsInput.value || '') : '').trim()
    };


    openaiApiKey = (apiKeyInput.value || '').trim();
    if (next.rememberKey) next.apiKey = openaiApiKey;

    settings = next;
    saveSettings(settings);

    if (!openaiApiKey) {
        alert('API Key is required.');
        showSettingsModal({force: true});
        return;
    }

    hideSettingsModal();

    // Apply new instructions immediately if connection params are unchanged.
    // If baseUrl/model/apiKey changed, reconnect.
    const isConnected = realtimeClient && realtimeClient.isOpen;

    const baseUrlChanged = isConnected && (String(realtimeClient.baseUrl || '') !== String(settings.baseUrl || ''));
    const modelChanged = isConnected && (String(realtimeClient.model || '') !== String(settings.model || ''));
    const keyChanged = isConnected && (String(realtimeClient.apiKey || '') !== String(openaiApiKey || ''));

    const mustReconnect = !isConnected || baseUrlChanged || modelChanged || keyChanged;

    if (!mustReconnect) {
        try {
            realtimeClient.updateInstructions(buildInstructions());
            console.debug('[realtime] session.update(instructions) sent');
        } catch (_) {
        }
        return;
    }

    initAI();
};

document.getElementById('cancelSettings').onclick = function () {
    const modal = document.getElementById('modal');
    const forced = modal.dataset.force === '1';
    if (forced && !openaiApiKey) return;
    hideSettingsModal();
};

document.getElementById('clearSettings').onclick = function () {
    clearSavedKey();
    settings = loadSettings();
    openaiApiKey = '';
    document.getElementById('apiKeyInput').value = '';
    document.getElementById('rememberKey').checked = false;
    alert('Saved key cleared.');
};

window.addEventListener('click', (event) => {
    const modal = document.getElementById('modal');
    if (event.target === modal) {
        const forced = modal.dataset.force === '1';
        if (forced && !openaiApiKey) return;
        hideSettingsModal();
    }
});

const settingsBtn = document.getElementById('settings');
if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
        settings = loadSettings();
        if (settings.rememberKey) openaiApiKey = settings.apiKey || '';
        showSettingsModal({force: false});
    });
}

// Initial bootstrap
if (!openaiApiKey) {
    showSettingsModal({force: true});
} else {
    initAI();
}


var eventId = 1

// --- Session recovery (same tab reload) ---
const HISTORY_KEY = 'realtimeHistory.v1';
const MAX_HISTORY_ITEMS = 40;

function loadHistory() {
    try {
        const raw = sessionStorage.getItem(HISTORY_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
        return [];
    }
}

function saveHistory(items) {
    try {
        sessionStorage.setItem(HISTORY_KEY, JSON.stringify(items));
    } catch (_) {
    }
}

function appendHistoryItem(item) {
    const items = loadHistory();
    items.push({
        ts: Date.now(),
        role: item.role,
        text: String(item.text || ''),
    });
    while (items.length > MAX_HISTORY_ITEMS) items.shift();
    saveHistory(items);
}

function historyAsTextBlock() {
    const items = loadHistory();
    if (!items.length) return '';
    // Keep it compact
    const lines = items.map(i => (i.role === 'user' ? 'User: ' : 'Assistant: ') + i.text);
    return lines.join('\n');
}

const BASE_INSTRUCTIONS = "You are Milena, my close friend and smart companion. Your voice is heard through a synced avatar. Communication style: warm, natural, concise. Default to 1–3 short sentences. Never add end-of-message invitations or follow-ups. STRICTLY FORBIDDEN phrases (and similar): 'if you need more', 'if you have questions', 'feel free', 'let me know', 'reach out'. Do NOT close with pleasantries or meta lines. End after the useful content. Ask a question only if it is strictly required to proceed; ask at most one. Avoid meta talk, disclaimers, long preambles, and summaries. No bullet lists unless I ask. If I’m silent, stay silent. If I ask for code/config, give the exact change with minimal explanation.";

function buildInstructions() {
    const extra = settings && settings.customInstructions ? String(settings.customInstructions).trim() : '';
    const prev = historyAsTextBlock();
    const prevBlock = prev ? ("\n\nPrevious conversation (same tab):\n" + prev) : '';

    if (!extra) return BASE_INSTRUCTIONS + prevBlock;
    return BASE_INSTRUCTIONS + "\n\nUser custom instructions:\n" + extra + prevBlock;
}

function initAI() {
    if (realtimeClient) {
        realtimeClient.close();
        realtimeClient = null;
    }

    realtimeClient = new RealtimeClient({
        baseUrl: settings.baseUrl,
        model: settings.model,
        apiKey: openaiApiKey,
        buildInstructions,
        onOpen: () => {
            avatar.setSleep(false);
            console.debug('Connected to OpenAI WebSocket');
        },
        onClose: () => {
            avatar.setSleep(true);
            stopCameraCapture();
            console.debug('Disconnected from OpenAI WebSocket');
        },
        onError: (error) => console.error('WebSocket Error:', error),
        onMessage: (response) => {
            if (response["type"] === "input_audio_buffer.speech_started" || response["type"] === "speech_started") {
                startCameraCapture();
                return;
            }
            if (
                response["type"] === "input_audio_buffer.speech_stopped" ||
                response["type"] === "input_audio_buffer.speech_ended" ||
                response["type"] === "speech_stopped"
            ) {
                scheduleStopCameraCapture(CAMERA_TAIL_MS);
                return;
            }

            if (response["type"] === "response.audio_transcript.done" && response["transcript"]) {
                appendHistoryItem({role: 'assistant', text: response["transcript"]});
                return;
            }

            if (response["type"] === "response.audio.delta") {
                const binaryData = atob(response["delta"]);
                recorder.addPlayChunk(PCM16Audio.bytesToPcm(binaryData));
            }
        },
        turnDetection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 500,
            create_response: true,
        },
        voice: 'sage',
    });

    realtimeClient.connect();
}

async function onUserInput(input) {
    const text = String(input || '').trim();
    if (!text) return;

    appendHistoryItem({role: 'user', text});

    if (realtimeClient && realtimeClient.isOpen) {
        realtimeClient.sendText(text);
    } else {
        initAI();
    }
}

const recorder = new PCM16Audio(
    chunk => {
        // Loopback mic for testing (optional)
       // recorder.addPlayChunk(chunk);

        // Send mic PCM16 @ 24kHz to OpenAI (base64-encoded little-endian bytes)
        if (realtimeClient && realtimeClient.isOpen) {
            realtimeClient.appendInputAudioBase64(PCM16Audio.pcm16ToBase64(chunk));
        }
    },
    ({startTime, duration}) => {
        startOutputVisemes({startTime, duration});
    }
);

// ----- Output lip sync (visemes) -----
// All viseme tracking logic and parameters live in visemes.js.
const outputAnalyser = recorder.createOutputAnalyser();

const outputVisemeTracker = createOutputTracker({
    analyser: outputAnalyser,
    setViseme: (v) => {
        avatar.setViseme(v);
    },
    debug: true,
});

function startOutputVisemes({startTime, duration}) {
    outputVisemeTracker.onOutputChunk({startTime, duration});
}


// Mic button:
// - starts/stops mic streaming to OpenAI (as before)
// - Camera frames are NOT sent just because mic is on;
//   they are sent only while server VAD says you are speaking.
document.getElementById('mic').addEventListener('click', async () => {
    const recClass = "recording"
    const el = document.getElementById('mic').classList
    if (!el.contains(recClass)) {
        el.add(recClass)

        // Switch lip-sync to mic for testing
        // recorder.enablePlaybackVisemes = false
        await recorder.start()
        //       await recorder.startMicVisemes()

        // Ensure realtime socket is up (needed to receive speech_started/stopped events)
        if (!realtimeClient || !realtimeClient.isOpen) {
            try {
                initAI();
            } catch (_) {
            }
        }

        // If camera is enabled, keep webcam ON (preview), but still only SEND while speech is detected.
        await ensureCameraOn();

    } else {
        el.remove(recClass)

        // Stop streaming microphone audio to OpenAI
        recorder.stop();
        recorder.enablePlaybackVisemes = true

        // Optional: clear any audio buffered on the server side
        try {
            if (realtimeClient && realtimeClient.isOpen) {
                realtimeClient.clearInputAudioBuffer();
            }
        } catch (_) {
        }

        // Stop sending frames. Keep webcam ON if camera is enabled.
        stopCameraCapture();
    }

});


// Camera button: enable/disable camera feature.
// Actual capture/send happens only while you are speaking.
document.getElementById('cam').addEventListener('click', async () => {
    const recClass = "recording";
    const btnClassList = document.getElementById('cam').classList;

    if (!btnClassList.contains(recClass)) {
        btnClassList.add(recClass);
        cameraEnabled = true;

        // Turn webcam ON immediately (preview), but do not start capture.
        await ensureCameraOn();

        // Ensure realtime socket is up (needed for VAD events)
        if (!realtimeClient || !realtimeClient.isOpen) {
            try {
                initAI();
            } catch (_) {
            }
        }
    } else {
        btnClassList.remove(recClass);
        cameraEnabled = false;

        // Stop capture AND turn webcam off.
        stopCameraCapture();
        cameraStreamer.stopCamera();
        if (camPreviewEl) camPreviewEl.style.display = 'none';
    }
});


window.onload = init;
