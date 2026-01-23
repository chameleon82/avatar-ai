class PCM16Audio {
    constructor(onChunk, onVisemeDetected) {
        // simplified viseme rules for lips syncing based on the sound frequency
        // this list of visemes is compatible with glb models
        this.visemeRules = [
            {viseme: 'CH', minFreq: 1000, maxFreq: 2500},
            {viseme: 'DD', minFreq: 200, maxFreq: 1000},
            {viseme: 'E', minFreq: 300, maxFreq: 1200},
            {viseme: 'FF', minFreq: 1000, maxFreq: 2500},
            {viseme: 'I', minFreq: 300, maxFreq: 1200},
            {viseme: 'O', minFreq: 300, maxFreq: 1200},
            {viseme: 'PP', minFreq: 1000, maxFreq: 3000},
            {viseme: 'RR', minFreq: 100, maxFreq: 1500},
            {viseme: 'SS', minFreq: 1000, maxFreq: 3000},
            {viseme: 'TH', minFreq: 1000, maxFreq: 2500},
            {viseme: 'U', minFreq: 300, maxFreq: 1200},
            {viseme: 'aa', minFreq: 100, maxFreq: 500},
            {viseme: 'kk', minFreq: 1000, maxFreq: 3000},
            {viseme: 'nn', minFreq: 200, maxFreq: 800},
        ];

        this.onChunk = onChunk;
        this.onVisemeDetected = onVisemeDetected;
        this.micAudioContext = null;
        this.targetSampleRate = 24000; // Fixed target sample rate (24000 Hz)

        this.playAudioContext = new AudioContext({
            sampleRate: this.targetSampleRate, // 24Khz is OpenAI sampling requirement
            latencyHint: 'interactive',
        });
        this.isPlaying = false;
        this.mediaStream = null;
        this.audioWorkletNode = null;
        this.audioQueue = [];
        this.inputSampleRate = null; // Will be set dynamically

        // Create an analyser node for frequency analysis
        this.analyser = this.playAudioContext.createAnalyser();
        this.analyser.fftSize = 1024; // Balance between frequency resolution and responsiveness
        this.analyser.smoothingTimeConstant = 0.25; // More smoothing => less jitter in dominant frequency


        // use chunk audio instead of analyzed for smoother voice. ideally those should sync good enough
        // this.analyser.connect(this.playAudioContext.destination);
        //const bufferLength = analyser.frequencyBinCount;

        // Track the last timestamp of the received audio chunk
        this.lastAudioTimestamp = 0;
        this.silenceThreshold = 0.02;  // Amplitude threshold to detect silence
        this.maxSilenceDuration = 1000; // Maximum silence duration in ms

        // Viseme detection smoothing / hysteresis
        this._currentViseme = null;
        this._candidateViseme = null;
        this._candidateFrames = 0;
        this._lastVisemeEmitTs = 0;

        // Tuning knobs
        this._analysisIntervalMs = 33; // ~30 fps: smoother and less jittery
        this._minHoldMs = 70; // hold viseme longer to avoid rapid toggling
        this._confirmFrames = 2; // require 2 consecutive frames to switch
        this._silenceRms = 0.008; // reduce micro-noise triggering



    }

    // start recording microphone
    async start() {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({audio: true});
        const audioTrack = this.mediaStream.getAudioTracks()[0];
        const settings = audioTrack.getSettings();
        this.inputSampleRate = settings.sampleRate || 48000; // Default to 48000 if not available

        // Use latencyHint to optimize for lower latency
        this.micAudioContext = new AudioContext({
            sampleRate: this.inputSampleRate,
            latencyHint: 'interactive',
        });

        const source = this.micAudioContext.createMediaStreamSource(this.mediaStream);

        var pathWithoutScriptName = document.querySelector('script[src$="pcm16Audio.js"]')?.src.replace(/\/[^\/]+$/, '/') || '';

        await this.micAudioContext.audioWorklet.addModule(pathWithoutScriptName + "/pcmProcessor.js");
        this.audioWorkletNode = new AudioWorkletNode(this.micAudioContext, 'pcm-processor');
        this.audioWorkletNode.port.onmessage = (event) => {
            const pcm16Data = new Int16Array(event.data);
            // Resample the buffer to target sample rate (24000 Hz)
            const resampledData = this.resampleBuffer(pcm16Data, this.inputSampleRate, this.targetSampleRate);

            // Check if the chunk is silent
            if (this.isSilent(resampledData)) {
                const currentTime = Date.now();
                if (currentTime - this.lastAudioTimestamp > this.maxSilenceDuration) {
                    // Skip chunk if silence is too long
                    return;
                }
            } else {
                this.lastAudioTimestamp = Date.now();
            }
            this.onChunk(resampledData);

            // link microphone output to headphones input
            //  this.audioQueue.push(resampledData);
            //  if (this.audioQueue.length === 1) {
            //      this.playNextChunk();
            //  }
        };

        source.connect(this.audioWorkletNode);

    }

    // Check if the audio chunk is silent
    isSilent(pcm16Data) {
        let maxAmplitude = 0;
        for (let i = 0; i < pcm16Data.length; i++) {
            const amplitude = Math.abs(pcm16Data[i]);
            if (amplitude > maxAmplitude) {
                maxAmplitude = amplitude;
            }
        }
        //  console.log(maxAmplitude < this.silenceThreshold * 32768)
        return maxAmplitude < this.silenceThreshold * 32768;  // 32768 is the max possible amplitude for PCM16
    }

    // Stop recording microphone
    stop() {
        // Ask the worklet to flush any remaining buffered samples first.
        if (this.audioWorkletNode) {
            try {
                this.audioWorkletNode.port.postMessage('STOP');
            } catch (e) {
                // ignore
            }
            this.audioWorkletNode.disconnect();
        }
        if (this.mediaStream) this.mediaStream.getTracks().forEach(track => track.stop());
        if (this.micAudioContext) this.micAudioContext.close();
    }


    addPlayChunk(pcm16Data) {
        this.audioQueue.push(pcm16Data);
        if (!this.isPlaying) this.playNextChunk();
    }

    playNextChunk() {
        const clz = this
        // console.log(this.isPlaying)
        if (this.audioQueue.length === 0) return
        this.isPlaying = true
        const pcm16Data = this.audioQueue.shift();
        // Convert PCM16 to Float32 for playback
        const float32Data = new Float32Array(pcm16Data.length);
        for (let i = 0; i < pcm16Data.length; i++) float32Data[i] = pcm16Data[i] / 32768;
        // Create an audio buffer with the target sample rate (24000 Hz)
        const audioBuffer = this.playAudioContext.createBuffer(1, float32Data.length, this.targetSampleRate);
        audioBuffer.getChannelData(0).set(float32Data);

        this.detectVisemeFromPCM16(audioBuffer, function () {
            if (clz.audioQueue.length === 0) {
                clz.isPlaying = false
                clz.onVisemeDetected(NaN)
            } else clz.playNextChunk();
        });
    }

    // Resample the audio buffer from 'fromSampleRate' to 'toSampleRate'
    resampleBuffer(buffer, fromSampleRate, toSampleRate) {
        if (fromSampleRate === toSampleRate) {
            return buffer; // No resampling needed if rates are the same
        }
        const ratio = fromSampleRate / toSampleRate;
        const newLength = Math.round(buffer.length / ratio);
        const newBuffer = new Int16Array(newLength);
        for (let i = 0; i < newLength; i++) {
            const index = i * ratio;
            const lower = Math.floor(index);
            const upper = Math.min(lower + 1, buffer.length - 1);
            const weight = index - lower;
            newBuffer[i] = buffer[lower] * (1 - weight) + buffer[upper] * weight;
        }
        return newBuffer;
    }


    detectVisemeFromPCM16(audioBuffer, cb) {
        const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        const timeArray = new Uint8Array(this.analyser.fftSize);

        // Create a buffer source to process the audio
        const bufferSource = this.playAudioContext.createBufferSource();
        bufferSource.buffer = audioBuffer;

        // Analyse the same audio that is being played.
        bufferSource.connect(this.analyser);
        bufferSource.connect(this.playAudioContext.destination);

        // Make analyser more speech-friendly
        this.analyser.minDecibels = -90;
        this.analyser.maxDecibels = -10;

        // Reset smoothing state for this playback segment
        this._candidateViseme = null;
        this._candidateFrames = 0;

        const clz = this;
        let timerId = null;

        function rmsFromTimeDomain(bytes) {
            // bytes are 0..255 with 128 as 0
            let sum = 0;
            for (let i = 0; i < bytes.length; i++) {
                const v = (bytes[i] - 128) / 128;
                sum += v * v;
            }
            return Math.sqrt(sum / bytes.length);
        }

        function emitVisemeMaybe(viseme) {
            const now = performance.now();

            // Treat null/NaN as silence
            if (!viseme || Number.isNaN(viseme)) {
                clz._candidateViseme = null;
                clz._candidateFrames = 0;

                if (clz._currentViseme !== null && now - clz._lastVisemeEmitTs >= clz._minHoldMs) {
                    clz._currentViseme = null;
                    clz._lastVisemeEmitTs = now;
                    clz.onVisemeDetected(null);
                }
                return;
            }

            // If same as current, just keep it
            if (viseme === clz._currentViseme) {
                clz._candidateViseme = null;
                clz._candidateFrames = 0;
                return;
            }

            // Enforce minimum hold to prevent jitter
            if (now - clz._lastVisemeEmitTs < clz._minHoldMs) {
                return;
            }

            // Confirm new candidate across multiple frames
            if (viseme === clz._candidateViseme) {
                clz._candidateFrames++;
            } else {
                clz._candidateViseme = viseme;
                clz._candidateFrames = 1;
            }

            if (clz._candidateFrames >= clz._confirmFrames) {
                clz._currentViseme = viseme;
                clz._lastVisemeEmitTs = now;
                clz.onVisemeDetected(viseme);
                clz._candidateViseme = null;
                clz._candidateFrames = 0;
            }
        }

        function analyzeFrame() {
            clz.analyser.getByteTimeDomainData(timeArray);
            const rms = rmsFromTimeDomain(timeArray);

            if (rms < clz._silenceRms) {
                emitVisemeMaybe(null);
                return;
            }

            clz.analyser.getByteFrequencyData(dataArray);

            // Focus on the speech band; ignore very low/high bins
            const dominantFreq = clz.findDominantFrequency(dataArray);

            // If we clearly have signal (RMS above silence), but the spectrum is too weak/noisy,
            // keep the current viseme instead of snapping to silence.
            if (Number.isNaN(dominantFreq)) {
                return;
            }

            const detectedViseme = clz.detectVisemeFromFrequency(dominantFreq);
            emitVisemeMaybe(detectedViseme);

        }

        // Start playback
        bufferSource.start();

        // Sample analyser regularly while this chunk is playing
        timerId = setInterval(analyzeFrame, this._analysisIntervalMs);

        bufferSource.onended = () => {
            if (timerId) clearInterval(timerId);
            bufferSource.disconnect();
            // Reset candidate and emit silence at the end
            clz._candidateViseme = null;
            clz._candidateFrames = 0;
            clz._currentViseme = null;
            clz.onVisemeDetected(null);
            cb();
        };
    }


    findDominantFrequency(frequencyData) {
        // Use the peak bin within a speech-focused band.
        // This is still a simplification, but it is far more stable than scanning the whole spectrum.
        const binHz = this.playAudioContext.sampleRate / this.analyser.fftSize;

        const minHz = 80;
        const maxHz = 3000;
        const minBin = Math.max(1, Math.floor(minHz / binHz));
        const maxBin = Math.min(frequencyData.length - 1, Math.ceil(maxHz / binHz));

        let maxAmplitude = 0;
        let maxIdx = -1;
        let totalAmplitude = 0;

        for (let i = minBin; i <= maxBin; i++) {
            const amplitude = frequencyData[i];
            totalAmplitude += amplitude;
            if (amplitude > maxAmplitude) {
                maxAmplitude = amplitude;
                maxIdx = i;
            }
        }

        // If totalAmplitude is too low, return NaN to avoid unstable results
        if (totalAmplitude < 50) return NaN;


        return Math.floor(maxIdx * binHz);
    }


    // Function to detect a viseme based on frequency
    detectVisemeFromFrequency(frequency) {
        for (const rule of this.visemeRules) {
            if (frequency >= rule.minFreq && frequency <= rule.maxFreq) {
                return rule.viseme;
            }
        }
        return null; // No viseme detected for this frequency range
    }
}


