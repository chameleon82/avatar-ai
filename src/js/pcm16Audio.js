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

        // Lip-sync source toggles
        this.enablePlaybackVisemes = true; // TTS/output lip-sync
        this.enableMicVisemes = false;     // mic lip-sync

        // Mic-viseme analyser state
        this.micAnalyser = null;
        this.micVisemeTimerId = null;

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
        this.analyser.smoothingTimeConstant = 0.10; // Lower smoothing => less latency (slightly more jitter)


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
        this._analysisIntervalMs = 16; // ~60 fps: lower viseme latency
        this._minHoldMs = 45; // a bit more hold to reduce jitter
        this._confirmFrames = 2; // require 2 consecutive frames to switch
        this._silenceRms = 0.010; // reduce micro-noise triggering


    }

    // start recording microphone
    async start() {
        // Avoid browser "voice call" processing which causes pumping/quacking and level drops on loud audio.
        // Best tested with headphones.
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
        // Stop mic-viseme monitoring if enabled
        this.stopMicVisemes();

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
            if (!clz.enablePlaybackVisemes) return;

            clz.analyser.getByteTimeDomainData(timeArray);
            const rms = rmsFromTimeDomain(timeArray);

            if (rms < clz._silenceRms) {
                emitVisemeMaybe(null);
                return;
            }

            clz.analyser.getByteFrequencyData(dataArray);

            // More robust than dominant frequency (works better across languages/voices)
            const detectedViseme = clz.detectVisemeFromSpectrum(dataArray);
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

    // --- Spectrum-based viseme detection (coarse, but less ambiguous than dominantFreq ranges) ---

    _hzToBin(hz) {
        const binHz = this.playAudioContext.sampleRate / this.analyser.fftSize;
        return Math.max(0, Math.min(this.analyser.frequencyBinCount - 1, Math.round(hz / binHz)));
    }

    _bandEnergy(frequencyData, minHz, maxHz) {
        const minBin = this._hzToBin(minHz);
        const maxBin = this._hzToBin(maxHz);
        let sum = 0;
        for (let i = minBin; i <= maxBin; i++) sum += frequencyData[i];
        return sum;
    }

    _spectralCentroidHz(frequencyData, minHz, maxHz) {
        const binHz = this.playAudioContext.sampleRate / this.analyser.fftSize;
        const minBin = this._hzToBin(minHz);
        const maxBin = this._hzToBin(maxHz);

        let weighted = 0;
        let total = 0;
        for (let i = minBin; i <= maxBin; i++) {
            const amp = frequencyData[i];
            total += amp;
            weighted += amp * (i * binHz);
        }
        if (total <= 0) return NaN;
        return weighted / total;
    }

    detectVisemeFromSpectrum(frequencyData) {
        // Simple band-energy + centroid heuristics.
        // Tweaked to reduce false "SS/CH" on vowels and improve vowel separation for TTS.
        const low = this._bandEnergy(frequencyData, 80, 400);
        const mid = this._bandEnergy(frequencyData, 400, 1200);
        const high = this._bandEnergy(frequencyData, 1200, 3000);
        const air = this._bandEnergy(frequencyData, 3000, 6000);

        const total = low + mid + high + air;
        if (total < 60) return null;

        const centroid = this._spectralCentroidHz(frequencyData, 80, 6000);
        const highRatio = (high + air) / total;
        const airRatio = air / total;
        const lowRatio = low / total;
        const midRatio = mid / total;

        // Fricatives / sibilants
        // Use airRatio as a gate: vowels (especially "И") can have high highRatio without being fricatives.
        // Tightened further based on mic logs: "И" can reach highRatio ~0.6 with airRatio ~0.18–0.28.
        // Treat as fricative only when both are clearly high.
        if ((highRatio > 0.60 && airRatio > 0.30) || (Number.isFinite(centroid) && centroid > 2600)) {
            // "В" (voiced labiodental fricative) can look very airy but is not a sibilant.
            // Your logs: centroid ~2450–2550, airRatio ~0.39–0.41, with some mid energy.
            // Prefer FF over SS in that region.
            if (
                airRatio > 0.33 &&
                Number.isFinite(centroid) &&
                centroid >= 2200 && centroid < 3000 &&
                midRatio > 0.12
            ) {
                return 'FF';
            }

            // Very airy / very high centroid => SS
            // Raise air threshold a bit: some "И" frames can have moderate air without being a fricative.
            if (airRatio > 0.33 || (Number.isFinite(centroid) && centroid > 4200)) return 'SS';
            // CH: bright but less airy
            if (Number.isFinite(centroid) && centroid > 3200) return 'CH';
            // FF vs TH: both are hard; centroid split is a coarse proxy
            if (Number.isFinite(centroid) && centroid > 2700) return 'FF';
            return 'TH';
        }

        // Vowels (very rough)
        if (!Number.isFinite(centroid)) return 'aa';

        // Nasals ("н/м"):
        // Nasals tend to be mid-heavy (strong energy in 400–1200) while keeping very low air/high.
        // Require a high midRatio so rounded vowels like "у" don't get misclassified as nn.
        if (centroid < 500 && lowRatio > 0.54 && midRatio > 0.38 && highRatio < 0.12 && airRatio < 0.06) {
            return 'nn';
        }

        // Nasal helper for mid centroids (common for sustained "ннн" on this mic)
        // Add a small lowRatio floor so "Е" doesn't get misclassified as nn.
        if (centroid >= 600 && centroid < 1300 && midRatio > 0.42 && lowRatio > 0.33 && highRatio < 0.28 && airRatio < 0.12) {
            return 'nn';
        }


        // Open/back area
        // Russian "у" (and many rounded back vowels) tends to be very "dark":
        // low centroid + very high low-band ratio. Prioritize U before aa.
        if (centroid < 600) {
            // Very low centroid => strongly rounded/back (U)
            if (centroid < 430) return 'U';

            // Very dark spectrum => U (tightened so rounded "O" doesn't drift to U)
            if (lowRatio > 0.70) return 'U';

            // If it's dark and centroid is clearly on the low side, prefer U (tightened)
            if (centroid < 460 && lowRatio > 0.60) return 'U';
            // Some "У" frames can sit higher (centroid ~500–600). Prefer U when the spectrum is
            // dark but not mid-heavy (nasals are handled above via midRatio).
            if (lowRatio > 0.55 && midRatio < 0.40 && highRatio < 0.10) return 'U';

            // Otherwise distinguish "aa" vs "O".
            // Empirically on your mic: sustained "А" shows higher highRatio (~0.30),
            // while "О" stays lower (~0.08–0.21). Use that to separate them.
            if (highRatio > 0.25 && lowRatio > 0.42) return 'aa';
            return 'O';
        }

        // "Р" helper: sustained Russian "р" (trill/tap) tends to be mid-heavy with some air.
        // Without this it often gets pulled into E/aa vowel buckets.
        if (centroid >= 850 && centroid < 1800 && midRatio > 0.34 && airRatio > 0.08 && airRatio < 0.28 && highRatio < 0.55) {
            return 'RR';
        }

        // --- Helpers for Russian vowels on this mic ---

        // "И" helper: on your mic "ИИИ" often lands around centroid ~900–1300.
        // Keep it from stealing "Е" by requiring relatively low midRatio.
        if (centroid >= 850 && centroid < 1400 && highRatio > 0.40 && airRatio < 0.14 && lowRatio < 0.38 && midRatio < 0.28) {
            return 'I';
        }

        // "Е" helper: keep "ЕЕЕ" from falling into the "Russian а" bucket,
        // and keep it from stealing "А" ("А" has lowRatio ~0.30–0.33 on your mic).
        if (centroid >= 850 && centroid < 1500 && highRatio > 0.30 && highRatio < 0.45 && airRatio < 0.18 && midRatio > 0.10 && lowRatio < 0.30) {
            return 'E';
        }


        // Loud "О" helper: strong "ООО" can drift into the Russian "а" bucket.
        // Keep it as "O" when it is moderately dark but not "U"-dark.
        // Allow a bit more highRatio (your mic shows up to ~0.33) and use midRatio to avoid stealing "Е".
        if (centroid >= 600 && centroid < 1050 && lowRatio > 0.38 && midRatio < 0.30 && highRatio < 0.35 && airRatio < 0.06) {
            return 'O';
        }


        // "А" helper: on your mic some "ААА" frames land around centroid ~1000–1350 and would fall into 'E'.
        // Prefer aa there so mouth stays wide.
        // Add an upper bound on lowRatio so dark "О" frames don't get pulled into aa.
        if (centroid >= 900 && centroid < 1400 && lowRatio > 0.21 && lowRatio < 0.36 && highRatio < 0.50 && airRatio < 0.14) {
            return 'aa';
        }

        // Russian "а" can sit around 700–1000 Hz centroid on some mics/voices.
        // If it is not fricative-like (highRatio not too large) and has moderate low energy, prefer "aa".
        if (centroid < 1100 && lowRatio > 0.30 && highRatio < 0.42) {
            return 'aa';
        }


        // "aa" onset helper: on your mic, the start of "а" in "ма" can briefly look like 'E'
        // (e.g. centroid ~900, highRatio ~0.33, lowRatio ~0.26). Treat that region as "aa".
        // IMPORTANT: keep this narrow so sustained "Э" doesn't get forced into "aa".
        if (centroid >= 650 && centroid < 1000 && lowRatio > 0.26 && highRatio >= 0.26 && highRatio < 0.45) {
            return 'aa';
        }

        // Explicit "Э" helper (Russian "э" often lands here on mic)
        if (centroid >= 950 && centroid < 1300 && lowRatio < 0.255 && highRatio >= 0.30 && highRatio < 0.46) {
            return 'E';
        }


        // If we have a lot of low energy but centroid is higher (common on mic for "а"), still prefer "aa".
        // Widened to reduce Russian "АААА" drifting into 'E'.
        if (centroid < 1600 && lowRatio > 0.36) {
            return 'aa';
        }


        // Mid vowels
        // Expand E range upward to avoid mapping mid-central vowels (e.g. in "FIRST") to I.
        // In many TTS voices, /ɜː/ and /ə/ end up with centroid values similar to /ɪ/.
        if (centroid < 2100) return 'E';

        // Keep I only for clearly bright vowels.
        if (centroid < 2600) {
            // If it's not extremely bright, prefer E to avoid the overly stretched "I" mouth.
            return lowRatio > 0.35 ? 'E' : 'I';
        }

        // Bright but not fricative
        return 'I';

    }

    // --- Mic viseme monitoring (no playback) ---

    async startMicVisemes() {
        // Ensure mic is started
        if (!this.mediaStream || !this.micAudioContext) {
            await this.start();
        }

        this.enableMicVisemes = true;

        if (!this.micAnalyser) {
            this.micAnalyser = this.micAudioContext.createAnalyser();
            this.micAnalyser.fftSize = 1024;
            this.micAnalyser.smoothingTimeConstant = 0.25;

            const source = this.micAudioContext.createMediaStreamSource(this.mediaStream);
            source.connect(this.micAnalyser);
        }

        const freq = new Uint8Array(this.micAnalyser.frequencyBinCount);
        const time = new Uint8Array(this.micAnalyser.fftSize);

        const rmsFromTimeDomain = (bytes) => {
            let sum = 0;
            for (let i = 0; i < bytes.length; i++) {
                const v = (bytes[i] - 128) / 128;
                sum += v * v;
            }
            return Math.sqrt(sum / bytes.length);
        };

        if (this.micVisemeTimerId) clearInterval(this.micVisemeTimerId);

        // Throttle debug logs
        this._micDebugLastTs = 0;

        this.micVisemeTimerId = setInterval(() => {
            if (!this.enableMicVisemes || !this.micAnalyser) return;

            this.micAnalyser.getByteTimeDomainData(time);
            const rms = rmsFromTimeDomain(time);

            if (rms < this._silenceRms) {
                this.onVisemeDetected(null);
                return;
            }

            this.micAnalyser.getByteFrequencyData(freq);

            // Compute diagnostics (same features used by detectVisemeFromSpectrum)
            const low = this._bandEnergy(freq, 80, 400);
            const mid = this._bandEnergy(freq, 400, 1200);
            const high = this._bandEnergy(freq, 1200, 3000);
            const air = this._bandEnergy(freq, 3000, 6000);
            const total = low + mid + high + air;
            const centroid = this._spectralCentroidHz(freq, 80, 6000);

            const highRatio = total > 0 ? (high + air) / total : 0;
            const airRatio = total > 0 ? air / total : 0;
            const lowRatio = total > 0 ? low / total : 0;

            const viseme = this.detectVisemeFromSpectrum(freq);

            const now = performance.now();
            if (now - (this._micDebugLastTs || 0) > 200) {
                this._micDebugLastTs = now;

                const c = Number.isFinite(centroid) ? Math.round(centroid) : 'null';
                const line = [
                    '[mic-viseme]',
                    `viseme=${viseme ?? 'null'}`,
                    `rms=${rms.toFixed(4)}`,
                    `centroid=${c}`,
                    `low=${lowRatio.toFixed(3)}`,
                    `mid=${(mid / total).toFixed(3)}`,
                    `high=${highRatio.toFixed(3)}`,
                    `air=${airRatio.toFixed(3)}`,
                ].join(' ');

                console.log(line);
            }

            this.onVisemeDetected(viseme);
        }, this._analysisIntervalMs);

    }

    stopMicVisemes() {
        this.enableMicVisemes = false;
        if (this.micVisemeTimerId) {
            clearInterval(this.micVisemeTimerId);
            this.micVisemeTimerId = null;
        }
    }

}



