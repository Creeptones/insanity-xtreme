/**
 * braids-ks-pluck — Karplus-Strong plucked-string resonator.
 *
 * Acts as a tuned comb filter: a delay line whose length is sampleRate/freq,
 * with a one-pole lowpass damping filter and a small per-sample loss in the
 * feedback path. Excitation is fed in via the `excite` AudioParam — typically
 * a brief noise burst connected from a BufferSource → Gain in the host graph.
 * The resonator turns that burst into a string-like decaying tone.
 *
 * Compared to the bare "saw + static lowpass" Pluck voice, KS gives:
 *   • frequency-dependent decay (highs die first — physically correct)
 *   • non-static spectral character (each strike rings differently)
 *   • short transient pluck noise without dedicated noise oscillators
 *   • per-pitch decay length (low notes ring longer than high notes)
 *
 * This file is framework-free (no imports) so it loads via
 * `audioWorklet.addModule()` without bundling, and stays portable to a future
 * Rust/WASM port. Keep it that way.
 */

class KSPluckProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'frequency', defaultValue: 220, minValue: 20, maxValue: 8000, automationRate: 'k-rate' },
      // Excitation input — typically a short noise burst at strike time.
      { name: 'excite', defaultValue: 0, minValue: -2, maxValue: 2, automationRate: 'a-rate' },
      // 0..1, higher = more highs damped per cycle (faster decay).
      { name: 'damping', defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      // 0..1 loop loss multiplier. 1 = no loss (rings forever, eventually
      // numerically unstable); ~0.997 gives a natural musical sustain.
      { name: 'sustain', defaultValue: 0.997, minValue: 0.5, maxValue: 1, automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();
    // Largest delay we'll ever need: lowest pitch is ~20 Hz.
    this.maxDelay = Math.ceil(sampleRate / 20) + 4;
    this.buffer = new Float32Array(this.maxDelay);
    this.writeIdx = 0;
    // One-tap state for the averaging-filter damping stage.
    this.prevDamped = 0;

    // Phase V3 explicit delay-line flush. The host used to "drain" stale
    // old-pitch resonance before each strike by scheduling sustain→0, but
    // the `sustain` descriptor floor is 0.5 so the browser clamped that to
    // a near-flush, never a true zero — a subtle pitch-clash on fast
    // re-pitched strikes. Instead the host now posts the per-strike drain
    // instants and we zero the delay buffer directly AT those times. This
    // keeps the `sustain` descriptor honest (0.5–1 is real musical
    // sustain) and makes the flush exact.
    //
    // `drainQueue` holds ascending absolute context times. In the test
    // harness `AudioWorkletProcessor` is a bare stub with no `port`, so
    // guard it; the public `drain()` is still directly callable there.
    this.drainQueue = [];
    if (this.port) {
      this.port.onmessage = (e) => {
        const d = e && e.data;
        if (!d) return;
        if (d.type === 'drain') {
          this.drain();
        } else if (d.type === 'drainAt' && Array.isArray(d.times)) {
          for (let i = 0; i < d.times.length; i++) {
            this.drainQueue.push(d.times[i]);
          }
          this.drainQueue.sort((a, b) => a - b);
        }
      };
    }
  }

  /** Zero the delay line + damping tap so the next excitation enters a
   *  silent resonator (no old-pitch energy → no pitch clash). */
  drain() {
    this.buffer.fill(0);
    this.prevDamped = 0;
  }

  process(_inputs, outputs, params) {
    const out = outputs[0] && outputs[0][0];
    if (!out) return true;
    const N = out.length;
    const buffer = this.buffer;
    const maxDelay = this.maxDelay;

    // Service any host-scheduled flushes whose instant falls at/under this
    // quantum's end. Quantum granularity (~2.7ms @48k) sits well inside the
    // host's ~12ms pre-strike drain window, so the buffer is silent before
    // the excitation burst arrives. `currentTime` is the context time at
    // the start of this render quantum (AudioWorkletGlobalScope global).
    if (this.drainQueue.length > 0) {
      const quantumEnd =
        (typeof currentTime === 'number' ? currentTime : 0) + N / sampleRate;
      let drained = false;
      while (this.drainQueue.length > 0 && this.drainQueue[0] <= quantumEnd) {
        this.drainQueue.shift();
        drained = true;
      }
      if (drained) this.drain();
    }

    const freqArr = params.frequency;
    const exciteArr = params.excite;
    const damping = params.damping[0];
    const sustain = params.sustain[0];

    // Damping coefficient: 0 → pass through (no extra LPF), 1 → full
    // 2-tap averaging filter (heaviest damping, fastest high decay).
    const dampMix = damping * 0.5;

    let writeIdx = this.writeIdx;
    let prevDamped = this.prevDamped;

    for (let i = 0; i < N; i++) {
      const f = freqArr.length > 1 ? freqArr[i] : freqArr[0];
      const e = exciteArr.length > 1 ? exciteArr[i] : exciteArr[0];

      // Fractional delay length from frequency. Integer rounding quantized
      // pitch to ±50 cents at high notes; linear interpolation between the
      // two bracketing taps tunes to <1 cent. The fractional read adds a
      // tiny, frequency-stable lowpass that reads as natural string damping.
      const delayLen = Math.max(
        2,
        Math.min(maxDelay - 2, sampleRate / Math.max(20, f)),
      );
      const di = Math.floor(delayLen);
      const fr = delayLen - di;
      const r0 = (writeIdx - di + maxDelay) % maxDelay;
      const r1 = (r0 - 1 + maxDelay) % maxDelay;
      const sample = buffer[r0] * (1 - fr) + buffer[r1] * fr;

      // Output is the interpolated delay tap.
      out[i] = sample;

      // 2-tap averaging filter (Karplus-Strong's classic LPF). Heavier
      // averaging = more damping = faster decay of high partials.
      const damped = sample * (1 - dampMix) + prevDamped * dampMix;
      prevDamped = sample;

      // Feedback with loss + new excitation.
      buffer[writeIdx] = damped * sustain + e;
      writeIdx = (writeIdx + 1) % maxDelay;
    }

    // Denormal flush: on long decays prevDamped trends toward subnormal
    // floats, which spike CPU on x86. One cheap clamp per render quantum.
    if (prevDamped > -1e-30 && prevDamped < 1e-30) prevDamped = 0;

    this.writeIdx = writeIdx;
    this.prevDamped = prevDamped;
    return true;
  }
}

registerProcessor('braids-ks-pluck', KSPluckProcessor);
