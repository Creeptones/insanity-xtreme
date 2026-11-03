/**
 * braids-modal — modal/additive synthesis worklet for Bell, Glass, and any
 * other inharmonic-bank voice.
 *
 * Each instance owns N sinusoidal partials (typically 12–24). Each partial
 * has its own:
 *   • ratio (multiplier on `frequency` AudioParam)
 *   • gain  (per-partial amplitude weight)
 *   • decayBase (T60 in seconds — time to decay 60 dB at damping=1)
 *   • strikeAmp (excitation coupling — typically lower for high partials,
 *     since a real strike puts more energy into low modes)
 *
 * Excitation: on each rising sample of `excite`, every partial's amplitude
 * envelope is reset to `excite × strikeAmp[p]` (max with current value, so
 * re-strikes don't kill ongoing decays). Partials then decay exponentially
 * at their own per-partial T60.
 *
 * The result is a struck inharmonic resonator — what the lite-tier 4-partial
 * BellVoice approximates without per-partial damping. With per-partial T60
 * the tail stays gold (low partials ring) while the strike is bright (high
 * partials decay in <1s).
 *
 * Aliasing: partials whose frequency exceeds 0.45·sampleRate are silently
 * skipped per render quantum — keeps high-pitch playback clean even when
 * the partial set extends to ratio×30.
 *
 * Framework-free (no imports). Portable to a future Rust port.
 */

class ModalProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "frequency", defaultValue: 220, minValue: 20, maxValue: 8000, automationRate: "k-rate" },
      { name: "excite", defaultValue: 0, minValue: 0, maxValue: 2, automationRate: "a-rate" },
      // damping multiplier on per-partial T60. 1 = nominal, >1 = faster decay,
      // <1 = longer ring. Audio-thread-safe to automate.
      { name: "damping", defaultValue: 1, minValue: 0.1, maxValue: 4, automationRate: "k-rate" },
    ];
  }

  constructor(opts) {
    super();
    const partials =
      (opts && opts.processorOptions && opts.processorOptions.partials) ||
      DEFAULT_PARTIALS;
    const N = partials.length;
    this.N = N;
    this.ratio = new Float32Array(N);
    this.gain = new Float32Array(N);
    this.decayBase = new Float32Array(N);
    this.strikeAmp = new Float32Array(N);
    this.phase = new Float32Array(N);
    this.amp = new Float32Array(N);
    this.alive = new Uint8Array(N);
    this.phaseInc = new Float32Array(N);
    this.decayMul = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      this.ratio[i] = partials[i].ratio;
      this.gain[i] = partials[i].gain;
      this.decayBase[i] = partials[i].decayBase;
      this.strikeAmp[i] = partials[i].strikeAmp != null ? partials[i].strikeAmp : 1.0;
      // Random initial phase per partial — avoids comb filtering across
      // partials and decorrelates re-strikes that land on the same sample.
      this.phase[i] = Math.random() * Math.PI * 2;
      this.amp[i] = 0;
      this.alive[i] = 1;
    }
    this.outputTrim = (opts && opts.processorOptions && opts.processorOptions.trim) || 0.35;
  }

  process(_inputs, outputs, params) {
    const out = outputs[0] && outputs[0][0];
    if (!out) return true;
    const blockN = out.length;
    const N = this.N;

    const freq = params.frequency[0];
    const damping = params.damping[0];
    const exciteArr = params.excite;
    const trim = this.outputTrim;

    const TWO_PI = Math.PI * 2;
    const twoPiOverSr = TWO_PI / sampleRate;
    const nyqGuard = sampleRate * 0.45;

    // Per-quantum precompute: phase increment + decay multiplier + alive mask.
    // O(N) per quantum (128 samples) so this is cheap relative to the inner
    // sample loop's O(N × blockN).
    for (let p = 0; p < N; p++) {
      const partialFreq = freq * this.ratio[p];
      if (partialFreq < nyqGuard) {
        this.alive[p] = 1;
        this.phaseInc[p] = partialFreq * twoPiOverSr;
      } else {
        // Partial above Nyquist — skip to avoid aliasing. Its amplitude
        // continues decaying so when freq drops back into range the partial
        // resumes at the right amplitude (no "frozen" residue).
        this.alive[p] = 0;
      }
      const effT60 = this.decayBase[p] / Math.max(0.1, damping);
      this.decayMul[p] = Math.exp(-6.908 / (effT60 * sampleRate));
      // Denormal flush: a partial's amp decays exponentially toward (but
      // never reaches) 0, trending subnormal on long tails and spiking CPU.
      // One cheap clamp per partial per quantum (amp is always ≥0 here).
      if (this.amp[p] < 1e-30) this.amp[p] = 0;
    }

    for (let i = 0; i < blockN; i++) {
      const e = exciteArr.length > 1 ? exciteArr[i] : exciteArr[0];

      // Excitation — strike all partials. max() preserves longer decays
      // when re-struck before they finish.
      if (e > 0.001) {
        for (let p = 0; p < N; p++) {
          const target = e * this.strikeAmp[p];
          if (target > this.amp[p]) this.amp[p] = target;
        }
      }

      let sum = 0;
      for (let p = 0; p < N; p++) {
        // Always advance phase (even when not alive) so re-entry isn't
        // gated to a fixed phase — sounds more natural on glissandi.
        this.phase[p] += this.phaseInc[p];
        if (this.phase[p] >= TWO_PI) this.phase[p] -= TWO_PI;
        if (this.alive[p]) {
          sum += Math.sin(this.phase[p]) * this.amp[p] * this.gain[p];
        }
        this.amp[p] *= this.decayMul[p];
      }

      out[i] = sum * trim;
    }

    return true;
  }
}

// Default if the host forgets to pass processorOptions — soft 4-partial
// bell so the worklet at least sounds like something.
const DEFAULT_PARTIALS = [
  { ratio: 1.0, gain: 0.9, decayBase: 3.0, strikeAmp: 1.0 },
  { ratio: 2.76, gain: 0.55, decayBase: 2.0, strikeAmp: 0.7 },
  { ratio: 5.4, gain: 0.3, decayBase: 1.2, strikeAmp: 0.5 },
  { ratio: 8.93, gain: 0.14, decayBase: 0.7, strikeAmp: 0.35 },
];

registerProcessor("braids-modal", ModalProcessor);
