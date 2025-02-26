class PCMProcessor extends AudioWorkletProcessor {
    constructor() {
        super()
        this.isRecording = true
        this.buffer = []
        this.bufferSize = 24000 // Adjust this size as needed

        this.port.onmessage = (event) => {
            if (event.data === 'STOP') {
                this.isRecording = false
                this.flush()
            }
        }
    }

    flush() {
        if (this.buffer.length > 0) {
            const finalBuffer = new Uint8Array(this.buffer)
            this.port.postMessage(finalBuffer.buffer)
            this.buffer = []
        }
    }

    process(inputs, outputs, parameters) {
        if (!this.isRecording) {
            this.flush()
            return false // Stop processing
        }
        outputs, parameters

        const input = inputs[0]
        if (input.length > 0) {
            const inputChannel = input[0]
            for (let i = 0; i < inputChannel.length; i++) {
                const sample = Math.max(-1, Math.min(1, inputChannel[i]))
                const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff
                this.buffer.push(intSample & 0xff)
                this.buffer.push((intSample >> 8) & 0xff)

                if (this.buffer.length >= this.bufferSize) {
                    const outputBuffer = new Uint8Array(this.buffer)
                    this.port.postMessage(outputBuffer.buffer)
                    this.buffer = []
                }
            }
        }
        return true
    }
}
registerProcessor('pcm-processor', PCMProcessor);