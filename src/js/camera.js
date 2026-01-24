class CameraStreamer {
    constructor({
                    width = 64,
                    height = 64,
                    fps = 3,
                    jpegQuality = 0.6,
                    facingMode = "user",
                    onFrame,
                    onError,
                    previewVideoEl,
                } = {}) {
        this.width = width;
        this.height = height;
        this.fps = fps;
        this.jpegQuality = jpegQuality;
        this.facingMode = facingMode;
        this.onFrame = onFrame;
        this.onError = onError;

        this.previewVideoEl = previewVideoEl || null;

        this.stream = null;
        this.video = null;
        this.canvas = document.createElement('canvas');
        this.canvas.width = width;
        this.canvas.height = height;
        this.ctx = this.canvas.getContext('2d', {willReadFrequently: false});

        this._timerId = null;
        this._cameraStarted = false;
        this._capturing = false;
    }

    // Start the actual webcam stream + video element, but do NOT start capturing frames yet.
    async startCamera() {
        if (this._cameraStarted) return;
        this._cameraStarted = true;

        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: this.facingMode,
                    width: {ideal: 640},
                    height: {ideal: 480},
                },
                audio: false,
            });

            this.video = this.previewVideoEl || document.createElement('video');
            this.video.playsInline = true;
            this.video.muted = true;
            this.video.autoplay = true;
            this.video.srcObject = this.stream;
            await this.video.play();
        } catch (e) {
            this._cameraStarted = false;
            this._safeStopStream();
            if (this.onError) this.onError(e);
            else console.error('[CameraStreamer] startCamera failed', e);
        }
    }

    // Start capturing frames on an interval. Requires camera to be started.
    async startCapture() {
        if (this._capturing) return;
        await this.startCamera();
        if (!this._cameraStarted) return;

        this._capturing = true;
        const intervalMs = Math.max(100, Math.round(1000 / this.fps));
        this._timerId = setInterval(() => this._captureAndEmit(), intervalMs);
    }

    // Stop capturing frames but keep the webcam stream alive.
    stopCapture() {
        this._capturing = false;
        if (this._timerId) {
            clearInterval(this._timerId);
            this._timerId = null;
        }
    }

    // Stop webcam stream and video.
    stopCamera() {
        this.stopCapture();
        this._cameraStarted = false;
        this._safeStopStream();

        if (this.video && !this.previewVideoEl) {
            try {
                this.video.pause();
            } catch (_) {
            }
            this.video.srcObject = null;
            this.video = null;
        }
    }

    // Backward compatible helpers
    async start() {
        await this.startCamera();
        await this.startCapture();
    }

    stop() {
        this.stopCamera();
    }

    _safeStopStream() {
        if (this.stream) {
            try {
                for (const t of this.stream.getTracks()) t.stop();
            } catch (_) {
            }
            this.stream = null;
        }
    }

    _captureAndEmit() {
        if (!this._capturing || !this.video) return;

        // If metadata not ready yet.
        if (!this.video.videoWidth || !this.video.videoHeight) return;

        // Cover-crop (center) to square-ish then scale.
        const vw = this.video.videoWidth;
        const vh = this.video.videoHeight;
        const size = Math.min(vw, vh);
        const sx = Math.floor((vw - size) / 2);
        const sy = Math.floor((vh - size) / 2);

        this.ctx.drawImage(this.video, sx, sy, size, size, 0, 0, this.width, this.height);

        // Small JPEG to keep bandwidth low.
        const dataUrl = this.canvas.toDataURL('image/jpeg', this.jpegQuality);
        if (this.onFrame) this.onFrame(dataUrl);
    }
}

// Export to window for non-module script usage
window.CameraStreamer = CameraStreamer;
