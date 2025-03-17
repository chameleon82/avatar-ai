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
        this.analyser.fftSize = 1024; // Optimal size to viseme detection
        this.analyser.smoothingTimeConstant = 0.2; // 0.2 is optimal for visemes to balance smoothness and transition
        // use chunk audio instead of analyzed for smoother voice. ideally those should sync good enough
        // this.analyser.connect(this.playAudioContext.destination);
        //const bufferLength = analyser.frequencyBinCount;
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

            // execute callback
            this.onChunk(resampledData)

            // link microphone output to headphones input
            //  this.audioQueue.push(resampledData);
            //  if (this.audioQueue.length === 1) {
            //      this.playNextChunk();
            //  }
        };

        source.connect(this.audioWorkletNode);

    }

    // Stop recording microphone
    stop() {
        if (this.audioWorkletNode) this.audioWorkletNode.disconnect();
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

        const clz = this
        const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        const chunkSize = this.analyser.fftSize; // Size of each chunk/frame. For visemes detection fftSize is optimal

        // Create a buffer source to process the audio
        const bufferSource = this.playAudioContext.createBufferSource();
        // connect buffer to Sound Output for smoother sound instead of analyzer
        bufferSource.connect(this.playAudioContext.destination);
        bufferSource.buffer = audioBuffer;
        bufferSource.start();

        const float32Data = audioBuffer.getChannelData(0)

        // Function to process each chunk/frame of PCM16 data
        // Todo: is it synced with bufferSource ends?
        function processChunk(startIdx, chunkSize) {
            const chunk = float32Data.slice(startIdx, startIdx + chunkSize);
            if (chunk.length === 0) return
            const audioBufferChunk = clz.playAudioContext.createBuffer(1, chunk.length, clz.playAudioContext.sampleRate);
            audioBufferChunk.getChannelData(0).set(chunk);

            // Create a temporary buffer source to feed to analyser
            const tempSource = clz.playAudioContext.createBufferSource();
            tempSource.buffer = audioBufferChunk;
            tempSource.connect(clz.analyser);

            tempSource.start();

            // Process the frequency data of this chunk
            clz.analyser.getByteFrequencyData(dataArray);
            // Find dominant frequencies in the chunk
            let dominantFreq = clz.findDominantFrequency(dataArray);
            // Map dominant frequency to a phoneme
            let detectedPhoneme = clz.detectVisemeFromFrequency(dominantFreq);
            // Invoke the callback with the detected phoneme
            clz.onVisemeDetected(detectedPhoneme)
            // Stop the temporary source after processing the chunk
            tempSource.onended = () => {
                tempSource.disconnect();
                tempSource.stop();
                processChunk(startIdx + chunkSize, chunkSize)
            };
        }

        processChunk(0, chunkSize)

        // Cleanup after processing
        bufferSource.onended = () => {
            bufferSource.disconnect();
            cb()
        };
    }

    findDominantFrequency(frequencyData) {
        let totalAmplitude = 0;
        let weightedSum = 0;
        let maxAmplitude = 0;
        let maxIdx = -1;

        // Iterate over the frequency data to find the maximum amplitude
        for (let i = 0; i < frequencyData.length; i++) {
            const frequency = i * (this.playAudioContext.sampleRate / this.analyser.fftSize);  // Frequency corresponding to the FFT bin
            const amplitude = frequencyData[i];

            // Find the maximum amplitude (dominant frequency)
            if (amplitude > maxAmplitude) {
                maxAmplitude = amplitude;
                maxIdx = i;
            }

            // Weighted sum for average frequency calculation
            weightedSum += frequency * amplitude;
            totalAmplitude += amplitude;
        }

        // Calculate the average frequency (weighted by amplitude)
        const averageFrequency = totalAmplitude > 0 ? Math.floor(weightedSum / totalAmplitude) : NaN;

        // If totalAmplitude is too low, return NaN to avoid errors
        if (totalAmplitude < 2000) return NaN;

        // Calculate and return the dominant frequency based on the max amplitude
        return Math.floor(maxIdx * (this.playAudioContext.sampleRate / this.analyser.fftSize));
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


