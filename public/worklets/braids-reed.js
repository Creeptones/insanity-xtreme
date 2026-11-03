/**
 * braids-reed — 2-op FM synthesis with modulator self-feedback and a parallel
 * formant filter bank. The lite-tier ReedVoice is a clean 2-op FM (carrier +
 * modulator, no feedback, no formant). This worklet adds:
 *
 *   • Self-feedback on the modulator (DX-style) — pushes the modulator
 *     toward a saturated/noisy waveform, gives the timbre body and breath.
 *   • Parallel 3-band formant filter — three RBJ bandpass biquads at vowel
 *     formant frequencies, summed with a small dry-FM mix. The result reads
 *     as "voiced reed" rather than "math FM".
 *   • FM index modulation via `fmIndex` AudioParam — host typically
 *     schedules this with the same shape as the gain envelope (scaled),
 *     producing the bright-on-attack, soft-on-decay timbre of a real reed.
 *
 * Framework-free (no imports). Portable to a future Rust port.
 */

class ReedFmProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "frequency", defaultValue: 220, minValue: 20, maxValue: 8000, automationRate: "k-rate" },
      // FM modulation index — modulator amplitude in carrier-radians.
      // Sweep via host envelopes to give attack brightness over a soft sustain.
      { name: "fmIndex", defaultValue: 1.2, minValue: 0, maxValue: 8, automationRate: "k-rate" },
      // Modulator self-feedback. 0 = clean sine modulator (mathy FM); ~1 =
      // near-saturated modulator (vocal/breath texture).
      { name: "feedback", defaultValue: 0.6, minValue: 0, maxValue: 1.5, automationRate: "k-rate" },
      // Modulator/carrier frequency ratio. Inharmonic ratios (1.7, 2.3) read
      // as vocal/breath; integer ratios (2, 3) read as brass/clarinet.
      { name: "modRatio", defaultValue: 1.7, minValue: 0.25, maxValue: 8, automationRate: "k-rate" },
    ];
  }

  constructor(opts) {
    super();
    this.phaseC = 0;
    this.phaseM = 0;
    this.prevMod = 0;

    const formants =
      (opts && opts.processorOptions && opts.processorOptions.formants) ||
      DEFAULT_REED_FORMANTS;
    const NF = formants.length;
    this.NF = NF;
    this.formantFreq = new Float32Array(NF);
    this.formantQ = new Float32Array(NF);
    this.formantGain = new Float32Array(NF);
    this.b0 = new Float32Array(NF);
    this.b2 = new Float32Array(NF);
    this.a1 = new Float32Array(NF);
    this.a2 = new Float32Array(NF);
    this.x1 = new Float32Array(NF);
    this.x2 = new Float32Array(NF);
    this.y1 = new Float32Array(NF);
    this.y2 = new Float32Array(NF);
    for (let f = 0; f < NF; f++) {
      this.formantFreq[f] = formants[f].freq;
      this.formantQ[f] = formants[f].Q != null ? formants[f].Q : 5;
      this.formantGain[f] = formants[f].gain != null ? formants[f].gain : 1;
      this.updateFormantCoefs(f);
    }

    this.dryMix =
      (opts && opts.processorOptions && opts.processorOptions.dryMix) || 0.3;
    this.formantMix =
      (opts && opts.processorOptions && opts.processorOptions.formantMix) || 0.7;
  }

  updateFormantCoefs(f) {
    // RBJ "constant 0 dB peak gain" BPF coefficients, pre-normalized by a0
    // so the inner loop can skip the divide.
    const omega = (2 * Math.PI * this.formantFreq[f]) / sampleRate;
    const alpha = Math.sin(omega) / (2 * this.formantQ[f]);
    const a0 = 1 + alpha;
    this.b0[f] = alpha / a0;
    this.b2[f] = -alpha / a0;
    this.a1[f] = (-2 * Math.cos(omega)) / a0;
    this.a2[f] = (1 - alpha) / a0;
  }

  process(_inputs, outputs, params) {
    const out = outputs[0] && outputs[0][0];
    if (!out) return true;
    const N = out.length;

    const freq = params.frequency[0];
    const fmIndex = params.fmIndex[0];
    const feedback = params.feedback[0];
    const modRatio = params.modRatio[0];

    const TWO_PI = Math.PI * 2;
    const twoPiOverSr = TWO_PI / sampleRate;
    const phaseIncC = freq * twoPiOverSr;
    const phaseIncM = freq * modRatio * twoPiOverSr;

    let phaseC = this.phaseC;
    let phaseM = this.phaseM;
    let prevMod = this.prevMod;

    // Local refs — avoids `this.` lookup in the inner per-sample loop.
    const NF = this.NF;
    const b0 = this.b0, b2 = this.b2, a1 = this.a1, a2 = this.a2;
    const x1 = this.x1, x2 = this.x2, y1 = this.y1, y2 = this.y2;
    const fGain = this.formantGain;
    const dryMix = this.dryMix;
    const fMix = this.formantMix;

    for (let i = 0; i < N; i++) {
      // Modulator with self-feedback. Phase-distortion via prevMod creates
      // saturated harmonics that the carrier then FMs on.
      const modOut = Math.sin(phaseM + feedback * prevMod);
      prevMod = modOut;
      phaseM += phaseIncM;
      if (phaseM >= TWO_PI) phaseM -= TWO_PI;

      // Carrier with FM from modulator. fmIndex = modulation depth in
      // carrier-radians.
      const carrier = Math.sin(phaseC + modOut * fmIndex);
      phaseC += phaseIncC;
      if (phaseC >= TWO_PI) phaseC -= TWO_PI;

      // Formant filter bank — sum of NF parallel BPFs.
      let formantSum = 0;
      for (let f = 0; f < NF; f++) {
        const x = carrier;
        const y =
          b0[f] * x + b2[f] * x2[f] - a1[f] * y1[f] - a2[f] * y2[f];
        x2[f] = x1[f];
        x1[f] = x;
        y2[f] = y1[f];
        y1[f] = y;
        formantSum += y * fGain[f];
      }

      out[i] = (carrier * dryMix + formantSum * fMix) * 0.45;
    }

    this.phaseC = phaseC;
    this.phaseM = phaseM;
    this.prevMod = prevMod;
    return true;
  }
}

// Reed-vocal default formants — F1/F2/F3 between an "ah" and a clarinet
// reed. Tunable per voice instance via processorOptions.formants.
const DEFAULT_REED_FORMANTS = [
  { freq: 600, Q: 5, gain: 1.0 },
  { freq: 1900, Q: 5, gain: 0.8 },
  { freq: 2700, Q: 6, gain: 0.55 },
];

registerProcessor("braids-reed", ReedFmProcessor);
