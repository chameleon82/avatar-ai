class PCMProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.isRecording = true;

        // Store PCM16 samples (not bytes).
        this.samples = [];

        // Number of samples per emitted chunk.
        // Target ~100ms to keep end-to-end latency low.
        // Use the worklet's sampleRate (same as micAudioContext.sampleRate).
        // Align to 128 to match WebAudio render quantum and reduce jitter.
        const targetMs = 100;
        const raw = Math.round(sampleRate * (targetMs / 1000));
        this.chunkSizeSamples = Math.max(128, Math.round(raw / 128) * 128);


        this.port.onmessage = (event) => {
            if (event.data === 'STOP') {
                this.isRecording = false;
                this.flush();
            }
        };
    }

    flush() {
        if (this.samples.length > 0) {
            const out = new Int16Array(this.samples);
            // Transfer the underlying buffer to avoid copies.
            this.port.postMessage(out.buffer, [out.buffer]);
            this.samples = [];
        }
    }

    process(inputs) {
        if (!this.isRecording) {
            this.flush();
            return false; // stop processing
        }

        const input = inputs[0];
        if (input && input.length > 0) {
            const inputChannel = input[0];
            for (let i = 0; i < inputChannel.length; i++) {
                // Clamp float sample to [-1..1]
                const sample = Math.max(-1, Math.min(1, inputChannel[i]));

                // Convert Float32 -> PCM16 with explicit rounding.
                let intSample = sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff);

                // Safety clamp to int16 range.
                if (intSample > 32767) intSample = 32767;
                if (intSample < -32768) intSample = -32768;

                this.samples.push(intSample);

                if (this.samples.length >= this.chunkSizeSamples) {
                    const out = new Int16Array(this.samples);
                    this.port.postMessage(out.buffer, [out.buffer]);
                    this.samples = [];
                }
            }
        }

        return true;
    }
}

registerProcessor('pcm-processor', PCMProcessor);
