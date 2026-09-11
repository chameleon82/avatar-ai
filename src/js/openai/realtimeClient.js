// src/js/openai/realtimeClient.js

export class RealtimeClient {
    constructor({
        baseUrl,
        model,
        apiKey,
        buildInstructions,
        onMessage,
        onMotion,
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
        this.onMotion = onMotion;
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
            ]
        );

        this.socket.onopen = () => {
            try {
                const sessionUpdate = {
                    event_id: this._nextEventId(),
                    type: 'session.update',
                    session: {
                        // Current Realtime API session schema.
                        type: 'realtime',
                        output_modalities: ['audio'],
                        instructions: this.buildInstructions ? this.buildInstructions() : '',
                        audio: {
                            input: {
                                format: {type: 'audio/pcm', rate: 24000},
                                turn_detection: this.turnDetection || {
                                    type: 'server_vad',
                                    threshold: 0.5,
                                    prefix_padding_ms: 300,
                                    silence_duration_ms: 500,
                                    create_response: true,
                                },
                            },
                            output: {
                                format: {type: 'audio/pcm', rate: 24000},
                                voice: this.voice,
                            },
                        },
                        tool_choice: 'auto',
                        tools: [{
                            type: 'function',
                            name: 'set_avatar_motion',
                            description: 'Move the avatar head and eyes to convey attention and emotion. Call sparingly, usually once per response or when the conversational emotion changes.',
                            parameters: {
                                type: 'object',
                                properties: {
                                    headYaw: {type: 'number', description: 'Head left/right in degrees, negative is left, range -18 to 18.'},
                                    headPitch: {type: 'number', description: 'Head up/down in degrees, negative is down, range -12 to 12.'},
                                    headRoll: {type: 'number', description: 'Head tilt in degrees, range -10 to 10.'},
                                    eyeYaw: {type: 'number', description: 'Eye gaze left/right in degrees, range -24 to 24.'},
                                    eyePitch: {type: 'number', description: 'Eye gaze up/down in degrees, range -14 to 14.'},
                                },
                                required: ['headYaw', 'headPitch', 'headRoll', 'eyeYaw', 'eyePitch'],
                                additionalProperties: false,
                            },
                        }],
                        max_output_tokens: 'inf',
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
                if (this.debug) console.debug('[realtime] received:', msg);
                if (this.onMessage) this.onMessage(msg);
            } catch (e) {
                console.error('[realtime] invalid server message:', event.data, e);
            }
        };

        this.socket.onclose = (event) => {
            if (this.debug) console.debug('[realtime] closed:', event.code, event.reason);
            if (this.onClose) this.onClose(event);
        };

        this.socket.onerror = (err) => {
            console.error('[realtime] WebSocket error:', err);
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
            session: {
                type: 'realtime',
                ...sessionPatch,
            },
        });
    }

    updateInstructions(instructions) {
        this.updateSession({instructions});
    }


    sendFunctionOutput(callId, output = 'ok') {
        if (!this.isOpen || !callId) return;
        this.sendEvent({
            event_id: this._nextEventId(),
            type: 'conversation.item.create',
            item: {
                type: 'function_call_output',
                call_id: callId,
                output: typeof output === 'string' ? output : JSON.stringify(output),
            },
        });
        this.sendEvent({
            event_id: this._nextEventId(),
            type: 'response.create',
        });
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
            event_id: this._nextEventId(),
            type: 'conversation.item.create',
            previous_item_id: null,
            item: {
                type: 'message',
                role: 'user',
                content: [{type: 'input_text', text}],
            },
        });
        this.sendEvent({
            event_id: this._nextEventId(),
            type: 'response.create',
        });
    }
}
