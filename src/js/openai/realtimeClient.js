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
        tools = [],
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
        this.tools = Array.isArray(tools) ? tools : [];

        this.socket = null;
        this._eventId = 1;
        this.responseInProgress = false;
        this.pendingResponses = [];
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
                            description: 'Control the avatar body nonverbally, including individual Ready Player Me finger curling and spreading. Use fingerGesture open for an open palm, fist for a closed hand, point for pointing, and peace for a V sign. Do not merely describe gestures in speech.',
                            parameters: {
                                type: 'object',
                                properties: {
                                    headYaw: {type: 'number', description: 'Head left/right degrees, range -18 to 18.'},
                                    headPitch: {type: 'number', description: 'Head up/down degrees, range -12 to 12.'},
                                    headRoll: {type: 'number', description: 'Head tilt degrees, range -10 to 10.'},
                                    eyeYaw: {type: 'number', description: 'Eye gaze left/right degrees, range -24 to 24.'},
                                    eyePitch: {type: 'number', description: 'Eye gaze up/down degrees, range -14 to 14.'},
                                    shoulderLift: {type: 'number', description: 'Shoulder shrug from -1 to 1.'},
                                    posture: {type: 'number', description: 'Posture from slouched (-1) to upright (1).'},
                                    leftArmLift: {type: 'number', description: 'Avatar left arm lift from -1 to 1.'},
                                    rightArmLift: {type: 'number', description: 'Avatar right arm lift from -1 to 1.'},
                                    leftArmSide: {type: 'number', description: 'Avatar left arm side sweep from -1 to 1.'},
                                    rightArmSide: {type: 'number', description: 'Avatar right arm side sweep from -1 to 1.'},
                                    leftForearmBend: {type: 'number', description: 'Avatar left elbow bend from -1 to 1.'},
                                    rightForearmBend: {type: 'number', description: 'Avatar right elbow bend from -1 to 1.'},
                                    leftHandTwist: {type: 'number', description: 'Avatar left hand twist from -1 to 1.'},
                                    rightHandTwist: {type: 'number', description: 'Avatar right hand twist from -1 to 1.'},
                                    leftFingerCurl: {type: 'number', description: 'Curl left fingers: -1 open, 0 neutral, 1 fist.'},
                                    rightFingerCurl: {type: 'number', description: 'Curl right fingers: -1 open, 0 neutral, 1 fist.'},
                                    leftFingerSpread: {type: 'number', description: 'Spread left fingers from -1 to 1.'},
                                    rightFingerSpread: {type: 'number', description: 'Spread right fingers from -1 to 1.'},
                                    fingerGesture: {type: 'string', enum: ['neutral', 'open', 'fist', 'point', 'peace'], description: 'Named finger pose; explicit curl/spread values override it.'},
                                    handGesture: {type: 'string', enum: ['none', 'open', 'wave', 'point', 'raise', 'shrug', 'talk'], description: 'Named arm gesture.'},
                                },
                                required: [],
                                additionalProperties: false,
                            },
                        }, {
                            type: 'function',
                            name: 'set_avatar_tracking',
                            description: 'Read the latest webcam image and silently aim the avatar toward the user face. Use this only for camera tracking, not conversation. Return normalized face coordinates.',
                            parameters: {
                                type: 'object',
                                properties: {
                                    faceX: {type: 'number', description: 'Face center horizontal position in the unmirrored webcam image: -1 is image left, 0 center, 1 image right. Do not mirror this value.'},
                                    faceY: {type: 'number', description: 'Face center vertical position in the image: -1 is top, 0 center, 1 bottom.'},
                                    distanceCm: {type: 'number', description: 'Estimated distance from the MacBook camera in centimeters; use 50 when uncertain.'},
                                    confidence: {type: 'number', description: 'Confidence from 0 to 1; use 0 when no face is visible.'},
                                },
                                required: ['faceX', 'faceY', 'distanceCm', 'confidence'],
                                additionalProperties: false,
                            },
                        }, {
                            type: 'function',
                            name: 'get_avatar_debug',
                            description: 'Read the avatar rig and current world-space joint pose for calibration. Call this after a movement when the user reports that a hand is crossed, too low, behind the back, or otherwise incorrect. Compare left/right wrist positions and rotations before choosing a correction. Do not speak just because this function is called.',
                            parameters: {type: 'object', properties: {}, additionalProperties: false},
                        }, {
                            type: 'function',
                            name: 'set_avatar_expression',
                            description: 'Set a subtle facial expression and optional gesture for the avatar. Use sparingly and keep intensity natural.',
                            parameters: {
                                type: 'object',
                                properties: {
                                    emotion: {type: 'string', enum: ['neutral', 'happy', 'sad', 'angry', 'surprised', 'confused']},
                                    intensity: {type: 'number', description: 'Expression intensity from 0 to 1.'},
                                    gesture: {type: 'string', enum: ['none', 'nod', 'shake', 'tilt']},
                                    gestureIntensity: {type: 'number', description: 'Gesture intensity from 0 to 1.'},
                                },
                                required: ['emotion', 'intensity', 'gesture', 'gestureIntensity'],
                                additionalProperties: false,
                            },
                        }, ...this.tools],
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
                this._observeResponseState(msg);
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


    _observeResponseState(msg) {
        if (msg.type === 'response.created') {
            this.responseInProgress = true;
            return;
        }

        if (msg.type === 'response.done' || msg.type === 'response.completed' ||
            msg.type === 'response.failed' || msg.type === 'response.cancelled') {
            this.responseInProgress = false;
            this._flushPendingResponse();
        }
    }

    _flushPendingResponse() {
        if (this.responseInProgress || !this.isOpen || !this.pendingResponses.length) return;
        const response = this.pendingResponses.shift();
        this.responseInProgress = true;
        this.sendEvent({
            event_id: this._nextEventId(),
            type: 'response.create',
            ...(Object.keys(response).length ? {response} : {}),
        });
    }

    requestResponse(response = {}) {
        if (!this.isOpen) return false;
        if (this.responseInProgress) {
            this.pendingResponses.push(response);
            if (this.debug) console.debug('[realtime] response.create queued; response still active');
            return false;
        }
        this.responseInProgress = true;
        this.sendEvent({
            event_id: this._nextEventId(),
            type: 'response.create',
            ...(Object.keys(response).length ? {response} : {}),
        });
        return true;
    }

    sendFunctionOutput(callId, output = 'ok', {silent = false} = {}) {
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
        this.requestResponse(silent ? {
            output_modalities: ['text'],
            instructions: 'Do not speak. Finish the camera-tracking tool turn silently.',
        } : {});
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
        this.requestResponse();
    }
}
