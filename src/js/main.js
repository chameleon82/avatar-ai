import {Avatar} from './avatar/avatar.js';
import {createOutputTracker} from './avatar/visemes.js';
import {CameraStreamer} from './camera/cameraStreamer.js';
import {PCM16Audio} from './audio/pcm16Audio.js';
import {RealtimeClient} from './openai/realtimeClient.js';

const AVATAR_OPTIONS = {
    'avatar-w': {
        model: './src/assets/avatar-w.glb',
        voice: 'sage',
        name: 'Milena',
        sex: 'female',
    },
    'avatar': {
        model: './src/assets/avatar.glb',
        voice: 'alloy',
        name: 'Alex',
        sex: 'male',
    },
    'avatar-m': {
        model: './src/assets/avatar-m.glb',
        voice: 'echo',
        name: 'Marcus',
        sex: 'male',
    },
};

const avatarDebugEnabled = new URLSearchParams(window.location.search).has('avatarDebug') || localStorage.getItem('avatarDebug') === '1';
let avatar = new Avatar(AVATAR_OPTIONS['avatar-w'].model, {debug: avatarDebugEnabled});
// The selected avatar and its voice are configured together in Settings.
let realtimeClient = null;
let pendingText = [];
function parseToolArguments(rawArguments) {
    const raw = typeof rawArguments === 'string' ? rawArguments.trim() : '';
    if (!raw) return {};
    const withoutMarkdown = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try {
        return JSON.parse(withoutMarkdown);
    } catch (error) {
        const repaired = withoutMarkdown.replace(/,\s*([}\]])/g, '$1');
        if (repaired !== withoutMarkdown) return JSON.parse(repaired);
        throw new SyntaxError(`${error.message}; raw tool arguments: ${withoutMarkdown}`);
    }
}
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
         // When the camera is enabled, sample the latest frame for silent face tracking.
         if (!realtimeClient || !realtimeClient.isOpen) return;

         const evt = {
             event_id: "event_" + eventId++,
             type: "conversation.item.create",
             previous_item_id: null,
             item: {
                 type: "message",
                 role: "user",
                 content: [{type: "input_image", image_url: dataUrl}]
             }
         };
         realtimeClient.sendEvent(evt);

         const now = performance.now();
         if (cameraEnabled && !trackingRequestInFlight && now - lastTrackingRequestAt >= TRACKING_INTERVAL_MS) {
             trackingRequestInFlight = true;
             lastTrackingRequestAt = now;
             realtimeClient.requestResponse({
                 output_modalities: ['text'],
                 instructions: 'Inspect the newest webcam image. Call set_avatar_tracking exactly once. Treat faceX and faceY as the face center in the unmirrored image: -1 is left/top and 1 is right/bottom. Estimate distance in cm (normally 50). Return confidence 0..1. Do not answer or speak.'
             });
         }
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
// - While enabled, low-rate frames are sent for silent face tracking.
// - Voice VAD may also request capture, but does not own the camera lifecycle.
 let cameraEnabled = false;
 let cameraCapturing = false;
 let cameraStopTimerId = null;
 let trackingRequestInFlight = false;
 let lastTrackingRequestAt = 0;
 const TRACKING_INTERVAL_MS = 1200;
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
    resizeAvatarRenderer();
    setupAvatarAdjusters();
    window.addEventListener('resize', resizeAvatarRenderer);
}


// ---- Settings (no backend) ----
// Stored in localStorage under SETTINGS_KEY.
// Security note: anything stored in localStorage is readable by any JS on this origin.
const SETTINGS_KEY = 'openaiSettings';

const defaultSettings = {
    baseUrl: 'https://api.openai.com',
    model: 'gpt-realtime-mini',
    avatar: 'avatar-w',
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

function getAvatarOption(id) {
    return AVATAR_OPTIONS[id] || AVATAR_OPTIONS['avatar-w'];
}

function resizeAvatarRenderer() {
    if (!avatar || !avatar.renderer || !avatar.camera) return;
    avatar.renderer.setSize(window.innerWidth, window.innerHeight);
    avatar.camera.aspect = window.innerWidth / window.innerHeight;
    avatar.camera.updateProjectionMatrix();
}

function applyAvatarSelection(id) {
    const option = getAvatarOption(id);
    const previous = avatar;
    avatar = new Avatar(option.model, {debug: avatarDebugEnabled});

    // Replace the rendered canvas without leaving the old render loop running.
    if (previous && previous.renderer) {
        const oldCanvas = previous.renderer.domElement;
        if (oldCanvas.parentNode) oldCanvas.parentNode.removeChild(oldCanvas);
        if (typeof previous.dispose === 'function') previous.dispose();
    }
    document.body.appendChild(avatar.renderer.domElement);
    // A new WebGL canvas starts at 300x150 unless it is explicitly sized.
    // Keep replacement avatars in the same full-screen viewport as the original.
    resizeAvatarRenderer();
}

// Console diagnostics for rig and movement troubleshooting.
// Enable with: avatarDebug.enable(); then run avatarDebug.report() or avatarDebug.testMotion().
window.avatarDebug = {
    enable() {
        localStorage.setItem('avatarDebug', '1');
        avatar.setDebug(true);
        document.getElementById('avatarAdjusters')?.removeAttribute('hidden');
        return avatar.getDebugReport();
    },
    disable() {
        localStorage.removeItem('avatarDebug');
        avatar.setDebug(false);
        document.getElementById('avatarAdjusters')?.setAttribute('hidden', '');
    },
    report() {
        const report = avatar.getDebugReport();
        console.table(report.nodes);
        console.log('[avatar debug] full report', report);
        console.log('[avatar debug] pose snapshot', avatar.getPoseSnapshot());
        return {...report, pose: avatar.getPoseSnapshot()};
    },
    pose() {
        const snapshot = avatar.getPoseSnapshot();
        console.table(Object.fromEntries(Object.entries(snapshot.joints).map(([key, value]) => [key, value?.position])));
        return snapshot;
    },
    testMotion() {
        avatar.setMotion({headYaw: 10, headPitch: 6, headRoll: 5, eyeYaw: 12, eyePitch: 6, leftArmLift: 0.65, rightArmLift: 0.35, leftArmSide: 0.8, rightArmSide: 0.8, leftForearmBend: 0.45, rightForearmBend: 0.7, leftHandTwist: 0.3, rightHandTwist: -0.25, leftFingerCurl: 0.7, rightFingerCurl: 0.7, leftFingerSpread: 0.2, rightFingerSpread: 0.2, fingerGesture: 'fist', handGesture: 'wave'});
        avatar.setBodyMotion({shoulderLift: 0.7, posture: 0.7});
        console.info('[avatar debug] testMotion applied; run avatarDebug.pose() after 1 second');
        return avatar.getDebugReport();
    },
};

function setupAvatarAdjusters() {
    const panel = document.getElementById('avatarAdjusters');
    if (!panel) return;

    panel.hidden = !avatarDebugEnabled;
     const keys = ['leftArmLift', 'rightArmLift', 'leftArmSide', 'rightArmSide', 'leftForearmBend', 'rightForearmBend', 'leftHandTwist', 'rightHandTwist', 'leftFingerCurl', 'rightFingerCurl', 'leftFingerSpread', 'rightFingerSpread'];
    const bodyKeys = ['shoulderLift', 'posture'];
    const zoomInput = document.getElementById('avatarZoomAdjuster');
    const zoomOutput = document.getElementById('avatarZoomValue');
    const readValues = () => Object.fromEntries(keys.map((key) => [key, Number(document.getElementById(key + 'Adjuster').value)]));
    const readBodyValues = () => Object.fromEntries(bodyKeys.map((key) => [key, Number(document.getElementById(key + 'Adjuster').value)]));
    const renderValues = (values) => {
        for (const key of [...keys, ...bodyKeys]) {
            const input = document.getElementById(key + 'Adjuster');
            const output = document.getElementById(key + 'Value');
            if (!input || !output) continue;
            input.value = String(values[key] ?? 0);
            output.value = Number(input.value).toFixed(2);
            output.textContent = output.value;
        }
    };
    const apply = () => {
        const values = readValues();
        const bodyValues = readBodyValues();
        avatar.setHandAdjustments({...values, fingerGesture: 'neutral', handGesture: 'none'});
        avatar.setBodyMotion(bodyValues);
        console.info('[avatar debug] manual adjusters applied', {...values, ...bodyValues, pose: avatar.getPoseSnapshot()});
    };

    for (const key of [...keys, ...bodyKeys]) {
        const input = document.getElementById(key + 'Adjuster');
        const output = document.getElementById(key + 'Value');
        input?.addEventListener('input', () => {
            if (output) {
                output.value = Number(input.value).toFixed(2);
                output.textContent = output.value;
            }
            apply();
        });
    }
    zoomInput?.addEventListener('input', () => {
        const zoom = Number(zoomInput.value);
        if (zoomOutput) zoomOutput.textContent = `${zoom.toFixed(2)}×`;
        avatar.setZoom(zoom);
        console.info('[avatar debug] manual zoom applied', {zoom});
    });
    document.getElementById('avatarAdjustersReset')?.addEventListener('click', () => {
        const zero = Object.fromEntries([...keys, ...bodyKeys].map((key) => [key, 0]));
        renderValues(zero);
        if (zoomInput) zoomInput.value = '1';
        if (zoomOutput) zoomOutput.textContent = '1.00×';
        avatar.setZoom(1);
        apply();
    });
    document.getElementById('avatarAdjustersReport')?.addEventListener('click', () => {
        console.info('[avatar debug] manual adjusters pose', avatar.getPoseSnapshot());
    });
    document.getElementById('avatarAdjustersClose')?.addEventListener('click', () => {
        panel.hidden = true;
    });
    renderValues(Object.fromEntries([...keys, ...bodyKeys].map((key) => [key, 0])));
}

function selectedAvatarId() {
    return AVATAR_OPTIONS[settings.avatar] ? settings.avatar : 'avatar-w';
}

function selectedAvatarVoice() {
    return getAvatarOption(selectedAvatarId()).voice;
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
    const avatarInput = document.getElementById('avatarInput');
    const apiKeyInput = document.getElementById('apiKeyInput');
    const rememberKeyEl = document.getElementById('rememberKey');
    const customInstructionsInput = document.getElementById('customInstructionsInput');

    baseUrlInput.value = settings.baseUrl || defaultSettings.baseUrl;
    modelInput.value = settings.model || defaultSettings.model;
    avatarInput.value = selectedAvatarId();
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
    const avatarInput = document.getElementById('avatarInput');
    const apiKeyInput = document.getElementById('apiKeyInput');
    const rememberKeyEl = document.getElementById('rememberKey');
    const customInstructionsInput = document.getElementById('customInstructionsInput');

    const next = {
        baseUrl: normalizeBaseUrl(baseUrlInput.value),
        model: (modelInput.value || defaultSettings.model).trim(),
        avatar: avatarInput.value in AVATAR_OPTIONS ? avatarInput.value : defaultSettings.avatar,
        rememberKey: !!rememberKeyEl.checked,
        apiKey: '',
        customInstructions: (customInstructionsInput ? (customInstructionsInput.value || '') : '').trim()
    };


    openaiApiKey = (apiKeyInput.value || '').trim();
    if (next.rememberKey) next.apiKey = openaiApiKey;

    const avatarChanged = settings.avatar !== next.avatar;
    settings = next;
    saveSettings(settings);

    if (!openaiApiKey) {
        alert('API Key is required.');
        showSettingsModal({force: true});
        return;
    }

    if (avatarChanged) applyAvatarSelection(settings.avatar);
    hideSettingsModal();

    // Apply new instructions immediately if connection params are unchanged.
    // If baseUrl/model/key/avatar changed, reconnect so the voice follows the avatar.
    const isConnected = realtimeClient && realtimeClient.isOpen;

    const baseUrlChanged = isConnected && (String(realtimeClient.baseUrl || '') !== String(settings.baseUrl || ''));
    const modelChanged = isConnected && (String(realtimeClient.model || '') !== String(settings.model || ''));
    const keyChanged = isConnected && (String(realtimeClient.apiKey || '') !== String(openaiApiKey || ''));
    const voiceChanged = isConnected && (String(realtimeClient.voice || '') !== String(selectedAvatarVoice()));

    const mustReconnect = !isConnected || baseUrlChanged || modelChanged || keyChanged || avatarChanged || voiceChanged;

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
    if (settings.avatar !== 'avatar-w') applyAvatarSelection(settings.avatar);
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

const BASE_INSTRUCTIONS = "Your name and character identity are supplied dynamically for the selected avatar. Your voice is heard through a synced avatar. Communication style: warm, natural, concise. Default to 1–3 short sentences. Nonverbal avatar control: use the set_avatar_motion function whenever body language adds meaning. The avatar has Ready Player Me Hips, Spine, Neck, Head, Left/RightShoulder, Left/RightArm, Left/RightForeArm, Left/RightHand, and usually Left/RightHandThumb1-3, Index1-3, Middle1-3, Ring1-3, and Pinky1-3 finger bones. For hello or goodbye, call set_avatar_motion with handGesture='wave' and a noticeable but natural arm lift. If the user asks to raise one or both hands above the head, call set_avatar_motion with handGesture='raise', use leftArmLift=1 and/or rightArmLift=1, and keep the corresponding forearm bend near 0. For finger poses, use fingerGesture='open' for an open palm, 'fist' for a closed hand, 'point' for pointing, and 'peace' for a V sign; use left/rightFingerCurl and left/rightFingerSpread for finer control. For uncertainty use 'shrug'; for indicating something use 'point'; for open emphasis use 'open'; for occasional conversational emphasis use 'talk'. When using a hand gesture, set the corresponding arm lift and forearm bend to non-zero values except for the special above-head raise gesture; do not only say that you are gesturing. Keep gestures brief and subtle, and return to handGesture='none' after the gesture when appropriate. STRICTLY FORBIDDEN phrases (and similar): 'if you need more', 'if you have questions', 'feel free', 'let me know', 'reach out'. Do NOT close with pleasantries or meta lines. End after the useful content. Ask a question only if it is strictly required to proceed; ask at most one. Avoid meta talk, disclaimers, long preambles, and summaries. No bullet lists unless I ask. If I’m silent, stay silent. If I ask for code/config, give the exact change with minimal explanation.";

const AVATAR_CALIBRATION_INSTRUCTIONS = "Avatar calibration: you can call get_avatar_debug to inspect the current rig and world-space pose. After every non-trivial hand movement, call get_avatar_debug and verify it. Compare leftHand/rightHand positions: screenRight is rightWrist.x minus leftWrist.x; if it is positive, the hands are separated in the expected viewer-left/viewer-right order, and if near zero or negative they may overlap/cross. Y is height and Z is depth toward the camera. Use leftArmSide/rightArmSide for movement sideways relative to each shoulder: positive means outward, negative inward. The snapshot reports requested versus actually smoothed applied values; wait for the applied values to approach the request before judging the result. Do not claim a pose is correct without checking the snapshot. If a correction is needed, call set_avatar_motion with explicit values, then call get_avatar_debug again.";
function buildInstructions() {
    const character = getAvatarOption(selectedAvatarId());
    const identity = `You are ${character.name}, a ${character.sex} character and smart companion. Always use this name and identity; never use the name or identity of another avatar. `;
    const extra = settings && settings.customInstructions ? String(settings.customInstructions).trim() : '';
    const prev = historyAsTextBlock();
    const prevBlock = prev ? ("\n\nPrevious conversation (same tab):\n" + prev) : '';
    const instructions = identity + BASE_INSTRUCTIONS + AVATAR_CALIBRATION_INSTRUCTIONS;

    if (!extra) return instructions + prevBlock;
    return instructions + "\n\nUser custom instructions:\n" + extra + prevBlock;
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
        onOpen: async () => {
            try {
                await recorder.resumePlayback();
            } catch (error) {
                console.warn('[audio] unable to resume playback', error);
            }
            avatar.setSleep(false);
            console.debug('Connected to OpenAI WebSocket');

            // Preserve text submitted while the socket was connecting.
            const queued = pendingText.splice(0);
            for (const text of queued) realtimeClient.sendText(text);
        },
        onClose: () => {
            avatar.setSleep(true);
            avatar.setListening(false);
            console.debug('Disconnected from OpenAI WebSocket');
        },
        onError: (error) => console.error('WebSocket Error:', error),
        onMessage: (response) => {
            // Keep the event stream visible while diagnosing a connected-but-silent avatar.
            if (response["type"] !== 'response.audio.delta' && response["type"] !== 'response.output_audio.delta') {
                console.debug('[realtime] event:', response["type"], response);
            }

            if (response["type"] === 'error') {
                console.error('[realtime] server error:', response.error || response);
                return;
            }
            if (response["type"] === 'response.function_call_arguments.done' && response.name === 'set_avatar_expression') {
                try {
                    const expression = JSON.parse(response.arguments || '{}');
                    avatar.setExpression(expression);
                    avatar.setGesture({type: expression.gesture, intensity: expression.gestureIntensity});
                    realtimeClient.sendFunctionOutput(response.call_id, 'Avatar expression applied.');
                } catch (error) {
                    console.warn('[avatar] invalid expression cue', error);
                    realtimeClient.sendFunctionOutput(response.call_id, 'Expression cue ignored because it was invalid.');
                }
                return;
            }
            if (response["type"] === 'response.function_call_arguments.done' && response.name === 'get_avatar_debug') {
                try {
                    const snapshot = avatar.getPoseSnapshot();
                    console.info('[avatar debug] get_avatar_debug snapshot', snapshot);
                    realtimeClient.sendFunctionOutput(response.call_id, snapshot, {silent: true});
                } catch (error) {
                    console.warn('[avatar] unable to build pose snapshot', error);
                    realtimeClient.sendFunctionOutput(response.call_id, {error: 'Pose snapshot unavailable.'}, {silent: true});
                }
                return;
            }
            if (response["type"] === 'response.function_call_arguments.done' && response.name === 'set_avatar_tracking') {
                try {
                    const tracking = JSON.parse(response.arguments || '{}');
                    avatar.setTracking(tracking);
                    realtimeClient.sendFunctionOutput(response.call_id, 'Tracking applied.', {silent: true});
                } catch (error) {
                    console.warn('[avatar] invalid tracking cue', error);
                    realtimeClient.sendFunctionOutput(response.call_id, 'Tracking cue ignored because it was invalid.', {silent: true});
                } finally {
                    trackingRequestInFlight = false;
                }
                return;
            }
            if (response["type"] === 'response.function_call_arguments.done' && response.name === 'set_avatar_motion') {
                try {
                    const motion = parseToolArguments(response.arguments);
                    console.info('[avatar debug] AI set_avatar_motion request', motion);
                    avatar.setMotion(motion);
                    avatar.setBodyMotion(motion);
                    const pose = avatar.getPoseSnapshot();
                    console.info('[avatar debug] pose returned to AI', pose);
                    realtimeClient.sendFunctionOutput(response.call_id, {status: 'movement applied', pose});
                } catch (error) {
                    console.warn('[avatar] invalid movement cue', error);
                    realtimeClient.sendFunctionOutput(response.call_id, {
                        error: 'Invalid movement JSON. Retry set_avatar_motion with a complete JSON object and no markdown.',
                    });
                }
                return;
            }
            if (response["type"] === "input_audio_buffer.speech_started" || response["type"] === "speech_started") {
                avatar.setListening(true);
                startCameraCapture();
                return;
            }
            if (
                response["type"] === "input_audio_buffer.speech_stopped" ||
                response["type"] === "input_audio_buffer.speech_ended" ||
                response["type"] === "speech_stopped"
            ) {
                avatar.setListening(false);
                if (!cameraEnabled) scheduleStopCameraCapture(CAMERA_TAIL_MS);
                return;
            }

            // The current API uses response.output_audio_transcript.done;
            // retain the older event name for compatible/proxy endpoints.
            if (
                (response["type"] === "response.output_audio_transcript.done" ||
                 response["type"] === "response.audio_transcript.done") &&
                response["transcript"]
            ) {
                appendHistoryItem({role: 'assistant', text: response["transcript"]});
                return;
            }

            // GA Realtime uses response.output_audio.delta. Older endpoints used
            // response.audio.delta. Both contain base64 PCM16 audio in `delta`.
            if (
                response["type"] === "response.output_audio.delta" ||
                response["type"] === "response.audio.delta"
            ) {
                try {
                    const binaryData = atob(response["delta"]);
                    recorder.addPlayChunk(PCM16Audio.bytesToPcm(binaryData));
                } catch (error) {
                    console.error('[audio] unable to play realtime audio delta', error);
                }
            }
        },
        turnDetection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 500,
            create_response: true,
        },
         voice: selectedAvatarVoice(),
        debug: true,
    });

    realtimeClient.connect();
}

async function onUserInput(input) {
    const text = String(input || '').trim();
    if (!text) return;

    appendHistoryItem({role: 'user', text});
    try {
        await recorder.resumePlayback();
    } catch (error) {
        console.warn('[audio] unable to resume playback', error);
    }

    if (realtimeClient && realtimeClient.isOpen) {
        realtimeClient.sendText(text);
    } else {
        pendingText.push(text);
        initAI();
    }
}

const recorder = new PCM16Audio(
    chunk => {
        // Loopback mic for testing (optional)
        // recorder.addPlayChunk(chunk);

        // Never feed the microphone back to Realtime while the avatar is
        // speaking. This is a second line of defense for Mac speakers when
        // browser acoustic echo cancellation is imperfect.
        if (recorder.isPlaying) return;

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

        // Keep camera tracking alive when only the microphone is turned off.
        if (!cameraEnabled) stopCameraCapture();
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

        // Turn webcam ON immediately and start low-rate tracking capture.
        await ensureCameraOn();
        await startCameraCapture();

        // Ensure realtime socket is up (needed for VAD events and tracking).
        if (!realtimeClient || !realtimeClient.isOpen) {
            try {
                initAI();
            } catch (_) {
            }
        }
    } else {
        btnClassList.remove(recClass);
        cameraEnabled = false;
        trackingRequestInFlight = false;
        lastTrackingRequestAt = 0;

        // Stop capture AND turn webcam off.
        stopCameraCapture();
        cameraStreamer.stopCamera();
        if (camPreviewEl) camPreviewEl.style.display = 'none';
    }
});


window.onload = init;
