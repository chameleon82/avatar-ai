// src/js/openai/realtimeClient.js

export class RealtimeClient {
    constructor({
        baseUrl,
        model,
        apiKey,
        buildInstructions,
        onMessage,
        onOpen,
        onClose,
        onError,
        turnDetection,
        voice = 'sage',
        debug = false,
    }) {
        this.baseUrl = baseUrl;
        this.model = model;
        this.apiKey = apiKey;
        this.buildInstructions = buildInstructions;

        this.onMessage = onMessage;
        this.onOpen = onOpen;
        this.onClose = onClose;
        this.onError = onError;

        this.turnDetection = turnDetection;
        this.voice = voice;
        this.debug = debug;

        this.socket = null;
        this._eventId = 1;
    }

    get isOpen() {
        return this.socket && this.socket.readyState === WebSocket.OPEN;
    }

    _nextEventId() {
        return 'event_' + this._eventId++;
    }

    static buildRealtimeWsUrl(baseUrl, model) {
        const m = (model || '').trim();
        const b = (baseUrl || '').trim();

        try {
            const u = new URL(b);
            const wsProto = (u.protocol === 'http:' || u.protocol === 'ws:') ? 'ws:' : 'wss:';
            const wsOrigin = wsProto + '//' + u.host;
            return wsOrigin + '/v1/realtime?model=' + encodeURIComponent(m);
        } catch (_) {
            return 'wss://api.openai.com/v1/realtime?model=' + encodeURIComponent(m);
        }
    }

    connect() {
        const wsUrl = RealtimeClient.buildRealtimeWsUrl(this.baseUrl, this.model);

        this.socket = new WebSocket(
            wsUrl,
            [
                'realtime',
                // Browser auth (as in your current code)
                'openai-insecure-api-key.' + this.apiKey,
                // Beta protocol
                'openai-beta.realtime-v1',
            ]
        );

        this.socket.onopen = () => {
            try {
                const sessionUpdate = {
                    event_id: this._nextEventId(),
                    type: 'session.update',
                    session: {
                        modalities: ['text', 'audio'],
                        instructions: this.buildInstructions ? this.buildInstructions() : '',
                        voice: this.voice,
                        input_audio_format: 'pcm16',
                        output_audio_format: 'pcm16',
                        turn_detection: this.turnDetection || {
                            type: 'server_vad',
                            threshold: 0.5,
                            prefix_padding_ms: 300,
                            silence_duration_ms: 500,
                            create_response: true,
                        },
                        tool_choice: 'auto',
                        temperature: 0.8,
                        max_response_output_tokens: 'inf',
                    },
                };

                this.sendEvent(sessionUpdate);
            } catch (_) {
            }

            if (this.onOpen) this.onOpen();
        };

        this.socket.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (this.onMessage) this.onMessage(msg);
            } catch (e) {
                // ignore parse errors
            }
        };

        this.socket.onclose = () => {
            if (this.onClose) this.onClose();
        };

        this.socket.onerror = (err) => {
            if (this.onError) this.onError(err);
        };
    }

    close() {
        try {
            if (this.socket) this.socket.close();
        } catch (_) {
        }
        this.socket = null;
    }

    sendEvent(obj) {
        if (!this.isOpen) return;
        this.socket.send(JSON.stringify(obj));
    }

    updateSession(sessionPatch) {
        // Sends session.update on an existing connection.
        if (!this.isOpen) return;
        if (this.debug) {
            try {
                console.debug('[realtime] session.update', sessionPatch);
            } catch (_) {
            }
        }
        this.sendEvent({
            event_id: this._nextEventId(),
            type: 'session.update',
            session: sessionPatch,
        });
    }

    updateInstructions(instructions) {
        this.updateSession({instructions});
    }


    appendInputAudioBase64(audioBase64) {
        this.sendEvent({
            event_id: this._nextEventId(),
            type: 'input_audio_buffer.append',
            audio: audioBase64,
        });
    }

    clearInputAudioBuffer() {
        this.sendEvent({
            event_id: this._nextEventId(),
            type: 'input_audio_buffer.clear',
        });
    }

    sendText(text) {
        if (!this.isOpen) return;
        this.sendEvent({
            type: 'conversation.item.create',
            previous_item_id: null,
            item: {
                type: 'message',
                role: 'user',
                content: [{type: 'input_text', text}],
            },
        });
        this.sendEvent({type: 'response.create'});
    }
}
