class PCM16Audio {
    static bytesToPcm(binaryData) {
        // Convert raw binary string (little-endian PCM16) -> Int16Array
        const sampleCount = binaryData.length / 2;
        const pcm16Data = new Int16Array(sampleCount);

        for (let i = 0; i < sampleCount; i++) {
            const lo = binaryData.charCodeAt(i * 2);
            const hi = binaryData.charCodeAt(i * 2 + 1);
            let value = (hi << 8) | lo;
            if (value & 0x8000) value -= 0x10000;
            pcm16Data[i] = value;
        }
        return pcm16Data;
    }

    static pcm16ToBase64(pcm16) {
        // Encode Int16Array -> base64 (little-endian bytes)
        const bytes = new Uint8Array(pcm16.length * 2);
        for (let i = 0; i < pcm16.length; i++) {
            const v = pcm16[i];
            bytes[i * 2] = v & 0xff;
            bytes[i * 2 + 1] = (v >> 8) & 0xff;
        }

        // Convert to binary string in chunks to avoid call-stack / memory spikes.
        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            const sub = bytes.subarray(i, i + chunkSize);
            binary += String.fromCharCode.apply(null, sub);
        }
        return btoa(binary);
    }

    constructor(onInputChunk, onOutputChunk) {
        this.onInputChunk = onInputChunk;
        this.onOutputChunk = onOutputChunk;

        this.targetSampleRate = 24000; // OpenAI requirement

        // Playback
        this.playAudioContext = new AudioContext({
            sampleRate: this.targetSampleRate,
            latencyHint: 'interactive',
        });
        this.isPlaying = false;
        this.audioQueue = [];

        // Expose a stable output node so callers can attach their own analyser/processing.
        this.outputGain = this.playAudioContext.createGain();
        this.outputGain.gain.value = 1.0;
        this.outputGain.connect(this.playAudioContext.destination);

        // Mic capture
        this.mediaStream = null;
        this.micAudioContext = null;
        this.audioWorkletNode = null;
        this.inputSampleRate = null;

        // Silence gating for mic sending
        this.lastAudioTimestamp = 0;
        this.silenceThreshold = 0.02;
        this.maxSilenceDuration = 1000;
    }

    get outputNode() {
        return this.outputGain;
    }

    // start recording microphone
    async start() {
        // Avoid browser "voice call" processing (pumping/quacking)
        const constraints = {
            audio: {
                channelCount: 1,
                echoCancellation: false,
                noiseSuppression: true,
                autoGainControl: false,
            },
        };

        this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        const audioTrack = this.mediaStream.getAudioTracks()[0];
        const settings = audioTrack.getSettings();
        this.inputSampleRate = settings.sampleRate || 48000;

        this.micAudioContext = new AudioContext({
            sampleRate: this.inputSampleRate,
            latencyHint: 'interactive',
        });

        const source = this.micAudioContext.createMediaStreamSource(this.mediaStream);

        const pathWithoutScriptName = document
            .querySelector('script[src$="pcm16Audio.js"]')
            ?.src.replace(/\/[^\/]+$/, '/') || '';

        await this.micAudioContext.audioWorklet.addModule(pathWithoutScriptName + '/pcmProcessor.js');
        this.audioWorkletNode = new AudioWorkletNode(this.micAudioContext, 'pcm-processor');
        this.audioWorkletNode.port.onmessage = (event) => {
            const pcm16Data = new Int16Array(event.data);
            const resampledData = this.resampleBuffer(pcm16Data, this.inputSampleRate, this.targetSampleRate);

            if (this.isSilent(resampledData)) {
                const currentTime = Date.now();
                if (currentTime - this.lastAudioTimestamp > this.maxSilenceDuration) {
                    return;
                }
            } else {
                this.lastAudioTimestamp = Date.now();
            }

            this.onInputChunk(resampledData);
        };

        source.connect(this.audioWorkletNode);
    }

    stop() {
        if (this.audioWorkletNode) {
            try {
                this.audioWorkletNode.port.postMessage('STOP');
            } catch (_) {
            }
            this.audioWorkletNode.disconnect();
            this.audioWorkletNode = null;
        }

        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }

        if (this.micAudioContext) {
            this.micAudioContext.close();
            this.micAudioContext = null;
        }
    }

    isSilent(pcm16Data) {
        let maxAmplitude = 0;
        for (let i = 0; i < pcm16Data.length; i++) {
            const amplitude = Math.abs(pcm16Data[i]);
            if (amplitude > maxAmplitude) maxAmplitude = amplitude;
        }
        return maxAmplitude < this.silenceThreshold * 32768;
    }

    addPlayChunk(pcm16Data) {
        this.audioQueue.push(pcm16Data);
        if (!this.isPlaying) this._playNextChunk();
    }

    _playNextChunk() {
        if (this.audioQueue.length === 0) return;
        this.isPlaying = true;

        const pcm16Data = this.audioQueue.shift();

        // PCM16 -> Float32
        const float32Data = new Float32Array(pcm16Data.length);
        for (let i = 0; i < pcm16Data.length; i++) float32Data[i] = pcm16Data[i] / 32768;

        const audioBuffer = this.playAudioContext.createBuffer(1, float32Data.length, this.targetSampleRate);
        audioBuffer.getChannelData(0).set(float32Data);

        const bufferSource = this.playAudioContext.createBufferSource();
        bufferSource.buffer = audioBuffer;
        bufferSource.connect(this.outputGain);

        const startTime = this.playAudioContext.currentTime;
        bufferSource.start(startTime);

        if (this.onOutputChunk) {
            try {
                this.onOutputChunk({
                    startTime,
                    duration: audioBuffer.duration,
                    sampleRate: this.playAudioContext.sampleRate,
                    frameCount: audioBuffer.length,
                });
            } catch (_) {
            }
        }

        bufferSource.onended = () => {
            bufferSource.disconnect();

            if (this.audioQueue.length === 0) {
                this.isPlaying = false;
            } else {
                this._playNextChunk();
            }
        };
    }

    resampleBuffer(buffer, fromSampleRate, toSampleRate) {
        if (fromSampleRate === toSampleRate) return buffer;

        const ratio = fromSampleRate / toSampleRate;
        const newLength = Math.round(buffer.length / ratio);
        const newBuffer = new Int16Array(newLength);

        for (let i = 0; i < newLength; i++) {
            const index = i * ratio;
            const lower = Math.floor(index);
            const upper = Math.min(lower + 1, buffer.length - 1);
            const weight = index - lower;
            const sample = buffer[lower] * (1 - weight) + buffer[upper] * weight;

            // Clamp and round
            const rounded = Math.round(sample);
            newBuffer[i] = Math.max(-32768, Math.min(32767, rounded));
        }

        return newBuffer;
    }
}
