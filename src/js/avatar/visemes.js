// visemes.js (ES module)

const VISeme_RULES = [
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

export function hzToBin(hz, sampleRate, fftSize, frequencyBinCount) {
    const binHz = sampleRate / fftSize;
    return Math.max(0, Math.min(frequencyBinCount - 1, Math.round(hz / binHz)));
}

export function bandEnergy(frequencyData, minHz, maxHz, sampleRate, fftSize) {
    const frequencyBinCount = frequencyData.length;
    const minBin = hzToBin(minHz, sampleRate, fftSize, frequencyBinCount);
    const maxBin = hzToBin(maxHz, sampleRate, fftSize, frequencyBinCount);
    let sum = 0;
    for (let i = minBin; i <= maxBin; i++) sum += frequencyData[i];
    return sum;
}

export function spectralCentroidHz(frequencyData, minHz, maxHz, sampleRate, fftSize) {
    const binHz = sampleRate / fftSize;
    const frequencyBinCount = frequencyData.length;
    const minBin = hzToBin(minHz, sampleRate, fftSize, frequencyBinCount);
    const maxBin = hzToBin(maxHz, sampleRate, fftSize, frequencyBinCount);

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

export function detectFromFrequency(frequency) {
    for (const rule of VISeme_RULES) {
        if (frequency >= rule.minFreq && frequency <= rule.maxFreq) {
            return rule.viseme;
        }
    }
    return null;
}

export function detectFromSpectrum(frequencyData, sampleRate, fftSize) {
    // IMPORTANT for mic-loopback: ignore very low frequencies (fundamental) when computing features.
    // Otherwise vowels like "ee/иии" can look like U/O because low band dominates.
    const low = bandEnergy(frequencyData, 200, 400, sampleRate, fftSize);
    const mid = bandEnergy(frequencyData, 400, 1200, sampleRate, fftSize);
    const high = bandEnergy(frequencyData, 1200, 3000, sampleRate, fftSize);
    const air = bandEnergy(frequencyData, 3000, 6000, sampleRate, fftSize);

    const total = low + mid + high + air;
    if (total < 60) return null;

    const centroid = spectralCentroidHz(frequencyData, 200, 6000, sampleRate, fftSize);
    const highRatio = (high + air) / total;
    const airRatio = air / total;
    const lowRatio = low / total;
    const midRatio = mid / total;

    if ((highRatio > 0.60 && airRatio > 0.30) || (Number.isFinite(centroid) && centroid > 2600)) {
        if (airRatio > 0.33 && Number.isFinite(centroid) && centroid >= 2200 && centroid < 3000 && midRatio > 0.12) {
            return 'FF';
        }

        if (airRatio > 0.33 || (Number.isFinite(centroid) && centroid > 4200)) return 'SS';
        if (Number.isFinite(centroid) && centroid > 3200) return 'CH';
        if (Number.isFinite(centroid) && centroid > 2700) return 'FF';
        return 'TH';
    }

    if (!Number.isFinite(centroid)) return 'aa';

    if (centroid < 500 && lowRatio > 0.54 && midRatio > 0.38 && highRatio < 0.12 && airRatio < 0.06) {
        return 'nn';
    }

    if (centroid >= 600 && centroid < 1300 && midRatio > 0.42 && lowRatio > 0.33 && highRatio < 0.28 && airRatio < 0.12) {
        return 'nn';
    }

    if (centroid < 600) {
        if (centroid < 430) return 'U';
        if (lowRatio > 0.70) return 'U';
        if (centroid < 460 && lowRatio > 0.60) return 'U';
        if (lowRatio > 0.55 && midRatio < 0.40 && highRatio < 0.10) return 'U';

        if (highRatio > 0.25 && lowRatio > 0.42) return 'aa';
        return 'O';
    }

    // RR: on mic, sustained "rrr" often has little to no "air" band energy.
    // Prefer RR in a narrow pocket: mid-heavy, not too airy, moderate highs.
    if (
        centroid >= 650 && centroid < 1100 &&
        midRatio > 0.45 &&
        lowRatio < 0.35 &&
        highRatio > 0.10 && highRatio < 0.40 &&
        airRatio < 0.10
    ) {
        return 'RR';
    }

    // "A" on some mics becomes very mid-dominant with low centroid and very little high/air.
    if (
        centroid >= 560 && centroid < 800 &&
        midRatio >= 0.62 &&
        lowRatio >= 0.22 &&
        airRatio <= 0.03 &&
        highRatio <= 0.12
    ) {
        return 'aa';
    }

    if (centroid < 1100 && lowRatio > 0.30 && highRatio < 0.42) {
        return 'aa';
    }

    if (centroid >= 650 && centroid < 1000 && lowRatio > 0.26 && highRatio >= 0.26 && highRatio < 0.45) {
        return 'aa';
    }

    if (centroid >= 950 && centroid < 1300 && lowRatio < 0.255 && highRatio >= 0.30 && highRatio < 0.46) {
        return 'E';
    }

    if (centroid < 1600 && lowRatio > 0.36) {
        return 'aa';
    }

    if (
        centroid >= 1100 && centroid < 2100 &&
        lowRatio > 0.33 &&
        airRatio < 0.18 &&
        highRatio < 0.50
    ) {
        return 'aa';
    }

    if (
        centroid < 2100 &&
        lowRatio > 0.34 &&
        lowRatio > midRatio &&
        airRatio < 0.15 &&
        highRatio < 0.48
    ) {
        return 'aa';
    }

    if (centroid < 2100) return 'E';

    if (centroid < 2600) {
        return lowRatio > 0.35 ? 'E' : 'I';
    }

    return 'I';
}

export function createOutputTracker({
    analyser,
    setViseme,
    detect = detectFromSpectrum,
    fftSize = 1024,
    smoothingTimeConstant = 0.10,
    minDecibels = -90,
    maxDecibels = -10,
    silenceRms = 0.010,
    minHoldMs = 90,
    confirmFrames = 3,
    intervalMs = 20,
    debug = false,
    debugIntervalMs = 200,
} = {}) {
    if (!analyser) throw new Error('createOutputTracker: analyser is required');
    if (!setViseme) throw new Error('createOutputTracker: setViseme is required');

    const ctx = analyser.context;

    analyser.fftSize = fftSize;
    analyser.smoothingTimeConstant = smoothingTimeConstant;
    analyser.minDecibels = minDecibels;
    analyser.maxDecibels = maxDecibels;

    const freq = new Uint8Array(analyser.frequencyBinCount);
    const time = new Uint8Array(analyser.fftSize);

    let intervalId = null;
    let startTimeoutId = null;
    let activeUntilSec = 0;

    let currentViseme = null;
    let candidateViseme = null;
    let candidateFrames = 0;
    let lastEmitTs = 0;

    let lastDebugTs = 0;

    function rmsFromTimeDomain(bytes) {
        let sum = 0;
        for (let i = 0; i < bytes.length; i++) {
            const v = (bytes[i] - 128) / 128;
            sum += v * v;
        }
        return Math.sqrt(sum / bytes.length);
    }

    function emitVisemeMaybe(viseme) {
        const now = performance.now();

        if (!viseme) {
            candidateViseme = null;
            candidateFrames = 0;

            if (currentViseme !== null && now - lastEmitTs >= minHoldMs) {
                currentViseme = null;
                lastEmitTs = now;
                setViseme(null);
            }
            return;
        }

        if (viseme === currentViseme) {
            candidateViseme = null;
            candidateFrames = 0;
            return;
        }

        if (now - lastEmitTs < minHoldMs) return;

        if (viseme === candidateViseme) {
            candidateFrames++;
        } else {
            candidateViseme = viseme;
            candidateFrames = 1;
        }

        if (candidateFrames >= confirmFrames) {
            currentViseme = viseme;
            lastEmitTs = now;
            setViseme(viseme);
            candidateViseme = null;
            candidateFrames = 0;
        }
    }

    function stop() {
        if (startTimeoutId) {
            clearTimeout(startTimeoutId);
            startTimeoutId = null;
        }
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }
        activeUntilSec = 0;

        currentViseme = null;
        candidateViseme = null;
        candidateFrames = 0;
        setViseme(null);
    }

    function ensureLoop() {
        if (intervalId) return;

        intervalId = setInterval(() => {
            const now = ctx.currentTime;
            if (activeUntilSec > 0 && now <= activeUntilSec) {
                analyser.getByteTimeDomainData(time);
                const rms = rmsFromTimeDomain(time);
                if (rms < silenceRms) {
                    emitVisemeMaybe(null);
                    return;
                }

                analyser.getByteFrequencyData(freq);
                const viseme = detect(freq, ctx.sampleRate, analyser.fftSize);

                if (debug) {
                    const nowMs = performance.now();
                    if (nowMs - lastDebugTs >= debugIntervalMs) {
                        lastDebugTs = nowMs;

                        const low = bandEnergy(freq, 200, 400, ctx.sampleRate, analyser.fftSize);
                        const mid = bandEnergy(freq, 400, 1200, ctx.sampleRate, analyser.fftSize);
                        const high = bandEnergy(freq, 1200, 3000, ctx.sampleRate, analyser.fftSize);
                        const air = bandEnergy(freq, 3000, 6000, ctx.sampleRate, analyser.fftSize);
                        const total = low + mid + high + air;
                        const centroid = spectralCentroidHz(freq, 200, 6000, ctx.sampleRate, analyser.fftSize);

                        const lowRatio = total > 0 ? low / total : 0;
                        const midRatio = total > 0 ? mid / total : 0;
                        const highRatio = total > 0 ? (high + air) / total : 0;
                        const airRatio = total > 0 ? air / total : 0;
                        const c = Number.isFinite(centroid) ? Math.round(centroid) : 'null';

                        console.log(
                            [
                                '[viseme-debug]',
                                `viseme=${viseme ?? 'null'}`,
                                `rms=${rms.toFixed(4)}`,
                                `centroid=${c}`,
                                `low=${lowRatio.toFixed(3)}`,
                                `mid=${midRatio.toFixed(3)}`,
                                `high=${highRatio.toFixed(3)}`,
                                `air=${airRatio.toFixed(3)}`,
                            ].join(' ')
                        );
                    }
                }

                emitVisemeMaybe(viseme);
                return;
            }

            stop();
        }, intervalMs);
    }

    function onOutputChunk({startTime, duration}) {
        const until = startTime + duration;
        activeUntilSec = Math.max(activeUntilSec || 0, until);

        const startDelayMs = Math.max(0, Math.round((startTime - ctx.currentTime) * 1000));
        if (!startTimeoutId) {
            startTimeoutId = setTimeout(() => {
                startTimeoutId = null;
                ensureLoop();
            }, startDelayMs);
        }

        if (ctx.currentTime >= startTime) {
            ensureLoop();
        }
    }

    return {
        onOutputChunk,
        stop,
    };
}

export const Visemes = {
    rules: VISeme_RULES,
    hzToBin,
    bandEnergy,
    spectralCentroidHz,
    detectFromFrequency,
    detectFromSpectrum,
    createOutputTracker,
};
