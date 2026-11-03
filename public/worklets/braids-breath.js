/**
 * braids-breath — multi-band noise pad worklet.
 *
 * Generates pink noise internally, then runs it through N parallel RBJ
 * bandpass filters at frequency-tracking ratios (default: 5 bands at 1.0,
 * 2.1, 3.2, 4.5, 6.8 × fundamental — slightly inharmonic for vocal/air
 * character). Each band's center frequency is independently random-walked
 * per render quantum, giving an organic "breathing" wobble that a single
 * LFO can't produce.
 *
 * The lite-tier BreathVoice is one bandpass with a sine LFO. This worklet
 * upgrades to a 5-band stack with stochastic detuning — reads as a real
 * voiced pad rather than "filtered noise with vibrato".
 *
 * `air` AudioParam scales output amplitude; the host couples the gain
 * envelope onto it (bands open when envelope rises, fall to silence when
 * envelope drops). `wobble` controls random-walk step size.
 *
 * Framework-free (no imports). Portable to a future Rust port.
 */

class BreathProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "frequency", defaultValue: 220, minValue: 20, maxValue: 8000, automationRate: "k-rate" },
      // Output amplitude scaler. 0 = silent, 1 = full bands. Host couples
      // the gain envelope onto this so the pad opens with amplitude.
      { name: "air", defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: "a-rate" },
      // Random-walk step size — controls per-band frequency drift speed.
      // 0 = static bands (sterile), 1 = heavy drift (bubbly/unstable).
      { name: "wobble", defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: "k-rate" },
    ];
  }

  constructor(opts) {
    super();
    const ratios =
      (opts && opts.processorOptions && opts.processorOptions.ratios) ||
      DEFAULT_BREATH_RATIOS;
    const NB = ratios.length;
    this.NB = NB;
    this.ratio = new Float32Array(ratios);
    this.b0 = new Float32Array(NB);
    this.b2 = new Float32Array(NB);
    this.a1 = new Float32Array(NB);
    this.a2 = new Float32Array(NB);
    this.x1 = new Float32Array(NB);
    this.x2 = new Float32Array(NB);
    this.y1 = new Float32Array(NB);
    this.y2 = new Float32Array(NB);
    // Per-band fractional frequency offset, drifts ±~5% via random walk.
    // Mean-reverts toward 0 each quantum so it doesn't run away.
    this.offset = new Float32Array(NB);

    // Paul Kellet pink-noise IIR state. Cheap 7-stage filter approximating
    // 1/f spectrum on white-noise input. Same algorithm as the lite-tier
    // shared pink noise buffer in braidsVoices.ts.
    this.pn0 = 0;
    this.pn1 = 0;
    this.pn2 = 0;
    this.pn3 = 0;
    this.pn4 = 0;
    this.pn5 = 0;
    this.pn6 = 0;
  }

  process(_inputs, outputs, params) {
    const out = outputs[0] && outputs[0][0];
    if (!out) return true;
    const N = out.length;

    const freq = params.frequency[0];
    const airArr = params.air;
    const wobble = params.wobble[0];
    const NB = this.NB;

    // Per-quantum random walk (cheap). Step size scales with wobble.
    const step = wobble * 0.005;
    const offset = this.offset;
    for (let p = 0; p < NB; p++) {
      offset[p] += (Math.random() - 0.5) * step;
      // Single-pole pull-back to 0 → bounded drift over time.
      offset[p] *= 0.999;
    }

    // Recompute RBJ bandpass coefficients per quantum (changes only at
    // 128-sample granularity, which is plenty smooth at our wobble rates).
    const ratio = this.ratio;
    const b0 = this.b0, b2 = this.b2, a1 = this.a1, a2 = this.a2;
    for (let p = 0; p < NB; p++) {
      const fc = freq * ratio[p] * (1 + offset[p]);
      const Q = 4 + p * 0.5; // higher bands narrower → distinct formant peaks
      const omega = (2 * Math.PI * Math.max(20, fc)) / sampleRate;
      const alpha = Math.sin(omega) / (2 * Q);
      const a0 = 1 + alpha;
      b0[p] = alpha / a0;
      b2[p] = -alpha / a0;
      a1[p] = (-2 * Math.cos(omega)) / a0;
      a2[p] = (1 - alpha) / a0;
    }

    const x1 = this.x1, x2 = this.x2, y1 = this.y1, y2 = this.y2;
    let pn0 = this.pn0, pn1 = this.pn1, pn2 = this.pn2, pn3 = this.pn3;
    let pn4 = this.pn4, pn5 = this.pn5, pn6 = this.pn6;

    for (let i = 0; i < N; i++) {
      // Pink-noise generation (Kellet 7-stage).
      const white = Math.random() * 2 - 1;
      pn0 = 0.99886 * pn0 + white * 0.0555179;
      pn1 = 0.99332 * pn1 + white * 0.0750759;
      pn2 = 0.96900 * pn2 + white * 0.1538520;
      pn3 = 0.86650 * pn3 + white * 0.3104856;
      pn4 = 0.55000 * pn4 + white * 0.5329522;
      pn5 = -0.7616 * pn5 - white * 0.0168980;
      const pink = (pn0 + pn1 + pn2 + pn3 + pn4 + pn5 + pn6 + white * 0.5362) * 0.11;
      pn6 = white * 0.115926;

      // Parallel bandpass sum.
      let bandSum = 0;
      for (let p = 0; p < NB; p++) {
        const x = pink;
        const y =
          b0[p] * x + b2[p] * x2[p] - a1[p] * y1[p] - a2[p] * y2[p];
        x2[p] = x1[p];
        x1[p] = x;
        y2[p] = y1[p];
        y1[p] = y;
        bandSum += y;
      }

      const air = airArr.length > 1 ? airArr[i] : airArr[0];
      out[i] = bandSum * air * 1.4;
    }

    // Denormal flush: the low pink-noise stages have very slow poles (up to
    // 0.99886) and trend toward subnormal floats during quiet passages, which
    // spike CPU on x86. One cheap clamp per render quantum, mirroring the same
    // guard in braids-ks-pluck.js. (pn6 is reassigned from `white` every
    // sample, so it cannot trend subnormal — no flush needed.)
    if (pn0 > -1e-30 && pn0 < 1e-30) pn0 = 0;
    if (pn1 > -1e-30 && pn1 < 1e-30) pn1 = 0;
    if (pn2 > -1e-30 && pn2 < 1e-30) pn2 = 0;
    if (pn3 > -1e-30 && pn3 < 1e-30) pn3 = 0;
    if (pn4 > -1e-30 && pn4 < 1e-30) pn4 = 0;
    if (pn5 > -1e-30 && pn5 < 1e-30) pn5 = 0;

    this.pn0 = pn0; this.pn1 = pn1; this.pn2 = pn2; this.pn3 = pn3;
    this.pn4 = pn4; this.pn5 = pn5; this.pn6 = pn6;
    return true;
  }
}

// Default 5-band ratio set — slightly inharmonic for vocal-pad character.
// Custom ratios can be passed via processorOptions.ratios per voice instance.
const DEFAULT_BREATH_RATIOS = [1.0, 2.1, 3.2, 4.5, 6.8];

registerProcessor("braids-breath", BreathProcessor);
