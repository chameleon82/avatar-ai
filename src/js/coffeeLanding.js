import {Avatar} from './avatar/avatar.js';
import {createOutputTracker} from './avatar/visemes.js';
import {RealtimeClient} from './openai/realtimeClient.js';
import {PCM16Audio} from './audio/pcm16Audio.js';

const AVATARS = {
    'avatar-w': {model: './src/assets/avatar-w.glb', voice: 'sage', name: 'Milena', sex: 'female'},
    avatar: {model: './src/assets/avatar.glb', voice: 'alloy', name: 'Alex', sex: 'male'},
    'avatar-m': {model: './src/assets/avatar-m.glb', voice: 'echo', name: 'Marcus', sex: 'male'},
};
const MENU = [
    {id: 'espresso', name: 'Espresso', description: 'Bold, short and silky', price: 3.20, icon: '☕'},
    {id: 'cappuccino', name: 'Cappuccino', description: 'Velvety milk and cocoa', price: 4.80, icon: '◒'},
    {id: 'latte', name: 'Vanilla latte', description: 'Sweet vanilla, soft foam', price: 5.40, icon: '🥛'},
    {id: 'cold-brew', name: 'Cold brew', description: 'Slow-steeped and bright', price: 4.60, icon: '🧊'},
    {id: 'matcha', name: 'Iced matcha', description: 'Earthy ceremonial green tea', price: 5.20, icon: '🍵'},
    {id: 'croissant', name: 'Butter croissant', description: 'Warm, flaky and golden', price: 3.90, icon: '🥐'},
];
const SETTINGS_KEY = 'openaiSettings';
const defaults = {baseUrl: 'https://api.openai.com', model: 'gpt-realtime-mini', avatar: 'avatar-w', apiKey: '', rememberKey: false};
let settings = loadSettings();
let apiKey = settings.rememberKey ? settings.apiKey : '';
let avatar = null;
let realtime = null;
let recorder = null;
let outputVisemeTracker = null;
let micOn = false;
let order = [];
let pendingPaymentCallId = null;
let paymentReference = '';
let paid = false;

function loadSettings() {
    try { return {...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')}; }
    catch (_) { return {...defaults}; }
}
function option() { return AVATARS[settings.avatar] || AVATARS['avatar-w']; }
function money(value) { return `$${value.toFixed(2)}`; }
function menuItem(id) { return MENU.find((item) => item.id === id); }
function orderTotal() { return order.reduce((total, line) => total + line.quantity * line.item.price, 0); }
function orderCount() { return order.reduce((total, line) => total + line.quantity, 0); }
function orderSummary() { return order.map((line) => `${line.quantity}× ${line.item.name}`).join(', ') || 'empty'; }

function renderMenu() {
    document.getElementById('menuGrid').innerHTML = MENU.map((item) => `
        <button class="menu-item" data-menu-id="${item.id}">
            <span class="menu-icon">${item.icon}</span><h3>${item.name}</h3>
            <p>${item.description}</p><span class="menu-price">${money(item.price)}</span>
        </button>`).join('');
    document.querySelectorAll('[data-menu-id]').forEach((button) => button.addEventListener('click', () => {
        addToOrder(button.dataset.menuId, 1);
        sendUserText(`The customer selected ${menuItem(button.dataset.menuId).name} using the menu button. It is already in the basket; confirm it without adding it again.`);
    }));
}
function renderBasket() {
    const lines = document.getElementById('basketLines');
    document.getElementById('basketCount').textContent = `${orderCount()} item${orderCount() === 1 ? '' : 's'}`;
    document.getElementById('basketTotal').textContent = money(orderTotal());
    document.getElementById('payButton').disabled = order.length === 0 || paid;
    document.getElementById('nextCustomerButton').hidden = !paid;
    lines.innerHTML = order.length ? order.map((line) => `<div class="basket-line"><span>${line.item.name}<small> × ${line.quantity}</small></span><strong>${money(line.item.price * line.quantity)}</strong><button class="remove-line" data-remove-id="${line.item.id}" aria-label="Remove ${line.item.name}">×</button></div>`).join('') : '<p class="empty-basket">Your basket is waiting for its first treat.</p>';
    lines.querySelectorAll('[data-remove-id]').forEach((button) => button.addEventListener('click', () => {
        removeFromOrder(button.dataset.removeId, 1);
        sendUserText(`Remove one ${menuItem(button.dataset.removeId).name} from my order.`);
    }));
}
function addToOrder(id, quantity = 1) {
    paid = false;
    const item = menuItem(id);
    const amount = Math.max(1, Math.min(9, Number(quantity) || 1));
    if (!item) return {error: `Unknown menu item: ${id}`};
    const line = order.find((entry) => entry.item.id === id);
    if (line) line.quantity = Math.min(9, line.quantity + amount);
    else order.push({item, quantity: amount});
    renderBasket();
    return {item: item.name, quantity: amount, order: orderSummary(), total: money(orderTotal())};
}
function removeFromOrder(id, quantity = 1) {
    const line = order.find((entry) => entry.item.id === id);
    if (!line) return {order: orderSummary(), total: money(orderTotal())};
    line.quantity -= Math.max(1, Number(quantity) || 1);
    if (line.quantity <= 0) order = order.filter((entry) => entry !== line);
    renderBasket();
    return {order: orderSummary(), total: money(orderTotal())};
}
function clearOrder() { order = []; renderBasket(); }

function qrMarkup(seed) {
    let hash = 2166136261;
    for (const char of seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    const cells = [];
    const finder = (x, y) => x < 7 && y < 7 || x >= 14 && y < 7 || x < 7 && y >= 14;
    for (let y = 0; y < 21; y++) for (let x = 0; x < 21; x++) {
        const inFinder = finder(x, y);
        const border = (x % 14 < 7 && y % 14 < 7) && (x % 14 === 0 || y % 14 === 0 || x % 14 === 6 || y % 14 === 6);
        const center = (x % 14 >= 2 && x % 14 <= 4 && y % 14 >= 2 && y % 14 <= 4);
        hash = Math.imul(hash ^ (x * 31 + y * 17), 16777619);
        cells.push(`<i class="qr-cell ${inFinder ? (border || center ? '' : 'off') : ((hash >>> 3) & 1 ? '' : 'off')}"></i>`);
    }
    return cells.join('');
}
function showPayment(callId = null) {
    if (!order.length) return {error: 'There is no order to pay for.'};
    pendingPaymentCallId = callId;
    paymentReference = `BEAN-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    document.getElementById('paymentAmount').textContent = money(orderTotal());
    document.getElementById('paymentReference').textContent = paymentReference;
    document.getElementById('qrCode').innerHTML = qrMarkup(paymentReference);
    document.getElementById('paymentPanel').hidden = false;
    return {status: 'payment screen shown', reference: paymentReference, total: money(orderTotal())};
}
function closePayment() { document.getElementById('paymentPanel').hidden = true; }

const BASE_INSTRUCTIONS = `You are the friendly barista ${option().name}. This is a coffee shop ordering experience. Speak warmly and briefly, like a real barista. The menu is: ${MENU.map((item) => `${item.id} (${item.name}) ${money(item.price)}`).join('; ')}. When the customer orders a drink or pastry, call add_to_order immediately; do not only repeat the order in speech. Use remove_from_order or clear_order when asked. Always use the exact item id from the menu. Keep the customer informed of the running total after changes. When the customer confirms they are finished, call request_payment; never claim that a real payment was processed. After payment success, thank the customer, give a short pickup estimate, and wait. After payment failure, apologize briefly and offer another attempt. Use set_avatar_motion for welcoming waves, attentive nods, and natural gestures. Never invent menu items or prices. Do not say 'if you need more', 'feel free', or similar closing phrases.`;
function instructions() { return `${BASE_INSTRUCTIONS.replace(/barista [^\.]+\./, `barista ${option().name}.`)}\nYou are ${option().name}, a ${option().sex} character. Current basket: ${orderSummary()}; total ${money(orderTotal())}.`; }

const coffeeTools = [
    {type: 'function', name: 'add_to_order', description: 'Add one or more exact menu items to the customer basket. Call this when the customer orders something.', parameters: {type: 'object', properties: {itemId: {type: 'string', enum: MENU.map((item) => item.id)}, quantity: {type: 'integer', minimum: 1, maximum: 9}}, required: ['itemId', 'quantity'], additionalProperties: false}},
    {type: 'function', name: 'remove_from_order', description: 'Remove items from the basket when the customer changes their mind.', parameters: {type: 'object', properties: {itemId: {type: 'string', enum: MENU.map((item) => item.id)}, quantity: {type: 'integer', minimum: 1, maximum: 9}}, required: ['itemId', 'quantity'], additionalProperties: false}},
    {type: 'function', name: 'clear_order', description: 'Empty the whole basket when the customer asks to start over.', parameters: {type: 'object', properties: {}, additionalProperties: false}},
    {type: 'function', name: 'request_payment', description: 'Show the simulated QR payment screen after the customer confirms the basket.', parameters: {type: 'object', properties: {}, additionalProperties: false}},
];

function resizeAvatar() {
    if (!avatar) return;
    const mount = document.getElementById('avatarMount');
    const rect = mount.getBoundingClientRect();
    avatar.renderer.setSize(rect.width, rect.height, false);
    avatar.camera.aspect = rect.width / Math.max(1, rect.height);
    avatar.camera.updateProjectionMatrix();
}
function createAvatar() {
    if (avatar?.dispose) avatar.dispose();
    avatar = new Avatar(option().model, {debug: false});
    document.getElementById('avatarMount').appendChild(avatar.renderer.domElement);
    resizeAvatar();
    document.getElementById('baristaName').textContent = `${option().name} is ready to help`;
}
function parseArguments(raw) {
    try { return JSON.parse(String(raw || '{}').replace(/^```json\s*/i, '').replace(/\s*```$/, '')); }
    catch (_) { return {}; }
}
function sendUserText(text) {
    const value = String(text || '').trim();
    if (!value) return;
    if (realtime?.isOpen) realtime.sendText(value);
}
function setStatus(connected) {
    const status = document.getElementById('baristaStatus');
    status.textContent = connected ? 'Connected' : 'Offline';
    status.classList.toggle('connected', connected);
}
function handleFunctionCall(message) {
    if (message.type !== 'response.function_call_arguments.done') return false;
    const args = parseArguments(message.arguments);
    let result;
    if (message.name === 'add_to_order') result = addToOrder(args.itemId, args.quantity);
    else if (message.name === 'remove_from_order') result = removeFromOrder(args.itemId, args.quantity);
    else if (message.name === 'clear_order') { clearOrder(); result = {status: 'basket cleared', total: '$0.00'}; }
    else if (message.name === 'request_payment') result = showPayment(message.call_id);
    else return false;
    realtime.sendFunctionOutput(message.call_id, result || {status: 'done'});
    return true;
}
function handlePayment(success) {
    const reference = paymentReference;
    closePayment();
    if (success) { paid = true; renderBasket(); }
    const message = success ? `Payment ${reference} succeeded. The customer has paid for ${orderSummary()}. Thank them, give a short pickup estimate, and wait for the next customer.` : `Payment ${reference} failed. Tell the customer briefly and offer to try the simulated payment again.`;
    if (pendingPaymentCallId && realtime?.isOpen) realtime.sendFunctionOutput(pendingPaymentCallId, {payment: success ? 'succeeded' : 'failed', reference});
    pendingPaymentCallId = null;
    sendUserText(message);
}
function resetForNextCustomer() {
    clearOrder();
    paid = false;
    closePayment();
    pendingPaymentCallId = null;
    sendUserText('A new customer has arrived. Greet them and ask what they would like to drink.');
}

function startRealtime() {
    if (!apiKey) { document.getElementById('coffeeSettingsPanel').hidden = false; return; }
    realtime?.close();
    realtime = new RealtimeClient({baseUrl: settings.baseUrl, model: settings.model, apiKey, voice: option().voice, buildInstructions: instructions, tools: coffeeTools, debug: true,
        onOpen: () => { setStatus(true); avatar.setSleep(false); sendUserText('A new customer has arrived. Greet them warmly and ask what they would like to order.'); },
        onClose: () => { setStatus(false); avatar.setSleep(true); },
        onError: (error) => console.error('[coffee realtime] websocket error', error),
        onMessage: (message) => {
            if (message.type === 'error') { console.error('[coffee realtime] server error', message.error || message); return; }
            if (handleFunctionCall(message)) return;
            if (message.type === 'response.output_audio.delta' || message.type === 'response.audio.delta') {
                try { recorder.addPlayChunk(PCM16Audio.bytesToPcm(atob(message.delta))); } catch (error) { console.error('[coffee audio]', error); }
            }
            if (message.type === 'response.output_audio_transcript.done' && message.transcript) console.debug('[coffee barista]', message.transcript);
            if (message.type === 'input_audio_buffer.speech_started') avatar.setListening(true);
            if (message.type === 'input_audio_buffer.speech_stopped') avatar.setListening(false);
            if (message.type === 'response.function_call_arguments.done' && message.name === 'set_avatar_motion') {
                const motion = parseArguments(message.arguments); avatar.setMotion(motion); avatar.setBodyMotion(motion); realtime.sendFunctionOutput(message.call_id, {status: 'motion applied'});
            }
            if (message.type === 'response.function_call_arguments.done' && message.name === 'set_avatar_expression') {
                const expression = parseArguments(message.arguments); avatar.setExpression(expression); avatar.setGesture({type: expression.gesture, intensity: expression.gestureIntensity}); realtime.sendFunctionOutput(message.call_id, {status: 'expression applied'});
            }
        }});
    realtime.connect();
}

function setupRecorder() {
    recorder = new PCM16Audio((chunk) => {
        if (!recorder.isPlaying && realtime?.isOpen) realtime.appendInputAudioBase64(PCM16Audio.pcm16ToBase64(chunk));
    }, ({startTime, duration}) => {
        outputVisemeTracker?.onOutputChunk({startTime, duration});
    });
    outputVisemeTracker = createOutputTracker({
        analyser: recorder.createOutputAnalyser(),
        setViseme: (viseme) => avatar?.setViseme(viseme),
        debug: true,
    });
}
function openSettings() {
    document.getElementById('coffeeBaseUrl').value = settings.baseUrl;
    document.getElementById('coffeeModel').value = settings.model;
    document.getElementById('coffeeAvatar').value = settings.avatar;
    document.getElementById('coffeeApiKey').value = apiKey;
    document.getElementById('coffeeRemember').checked = settings.rememberKey;
    document.getElementById('coffeeSettingsPanel').hidden = false;
}
function saveCoffeeSettings() {
    settings = {...settings, baseUrl: document.getElementById('coffeeBaseUrl').value.trim() || defaults.baseUrl, model: document.getElementById('coffeeModel').value.trim() || defaults.model, avatar: document.getElementById('coffeeAvatar').value, rememberKey: document.getElementById('coffeeRemember').checked};
    apiKey = document.getElementById('coffeeApiKey').value.trim();
    settings.apiKey = settings.rememberKey ? apiKey : '';
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    document.getElementById('coffeeSettingsPanel').hidden = true;
    createAvatar();
    startRealtime();
}

window.addEventListener('resize', resizeAvatar);
document.getElementById('coffeeSettings').addEventListener('click', openSettings);
document.getElementById('closeSettings').addEventListener('click', () => document.getElementById('coffeeSettingsPanel').hidden = true);
document.getElementById('saveCoffeeSettings').addEventListener('click', saveCoffeeSettings);
document.getElementById('payButton').addEventListener('click', () => showPayment());
document.getElementById('nextCustomerButton').addEventListener('click', resetForNextCustomer);
document.getElementById('closePayment').addEventListener('click', closePayment);
document.getElementById('paymentSuccess').addEventListener('click', () => handlePayment(true));
document.getElementById('paymentFailure').addEventListener('click', () => handlePayment(false));
document.getElementById('coffeeTextSend').addEventListener('click', () => { const input = document.getElementById('coffeeText'); sendUserText(input.value); input.value = ''; });
document.getElementById('coffeeText').addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); document.getElementById('coffeeTextSend').click(); } });
document.getElementById('coffeeMic').addEventListener('click', async () => {
    const button = document.getElementById('coffeeMic');
    if (!micOn) { micOn = true; button.classList.add('recording'); await recorder.start(); }
    else { micOn = false; button.classList.remove('recording'); recorder.stop(); }
});

renderMenu(); renderBasket(); createAvatar(); setupRecorder();
if (!apiKey) openSettings(); else startRealtime();
