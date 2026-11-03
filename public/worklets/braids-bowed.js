/**
 * braids-bowed — single-delay-line bowed-string waveguide (simplified Smith
 * model).
 *
 *   delay.read() ──► bridge: 1-pole LP, sign-flip, loss ──┐
 *                                                          ▼
 *                                              ┌── reflected wave
 *                                              │
 *                                              ▼
 *                                v_rel = bow_vel − reflected
 *                                friction = bowTable(v_rel) × pressure
 *                                              │
 *                                              ▼
 *                                  delay.write(reflected + friction)
 *                                              │
 *                                              ▼
 *                                          out = reflected
 *
 * The host couples the gain-envelope shape onto `bowVelocity` so the bow
 * engages with amplitude — when the envelope is silent, no bow contact and
 * the string decays naturally. Pressure and damping are k-rate so they can
 * be macro-modulated later without restarting the voice.
 *
 * The bow nonlinearity is a sticky-slip friction approximation: high
 * friction at small |v_rel| (sticking phase, string follows bow) → drops
 * sharply at the slip threshold (slipping phase, string releases and
 * oscillates freely). This is the Helmholtz mechanism that gives bowed
 * strings their characteristic sawtooth-ish waveform.
 *
 * Framework-free (no imports). Portable to a future Rust port.
 */

class BowedProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "frequency", defaultValue: 220, minValue: 20, maxValue: 8000, automationRate: "k-rate" },
      // Bow velocity. 0 = no bow contact (string decays freely). The host
      // typically schedules this with the gain-envelope shape rescaled into
      // a usable bowing range (~0..0.6). a-rate so envelope ramps are smooth.
      { name: "bowVelocity", defaultValue: 0, minValue: 0, maxValue: 1, automationRate: "a-rate" },
      // Bow pressure. Scales the friction force. Sweet spot ~0.4–0.6;
      // too high → squeak / no oscillation; too low → wispy / no tone.
      { name: "bowPressure", defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      // Bridge damping. 0 = open/bright/long-sustain, 1 = dull/short.
      { name: "damping", defaultValue: 0.35, minValue: 0, maxValue: 1, automationRate: "k-rate" },
    ];
  }

  constructor() {
    super();
    this.maxDelay = Math.ceil(sampleRate / 20) + 4;
    this.buffer = new Float32Array(this.maxDelay);
    this.writeIdx = 0;
    // 1-pole bridge filter state (recursive lowpass).
    this.bridgeState = 0;
  }

  process(_inputs, outputs, params) {
    const out = outputs[0] && outputs[0][0];
    if (!out) return true;
    const N = out.length;
    const buf = this.buffer;
    const maxDelay = this.maxDelay;

    const freq = params.frequency[0];
    const bowVelArr = params.bowVelocity;
    const pressure = params.bowPressure[0];
    const damping = params.damping[0];
    const fHz = Math.max(20, freq);

    // Bridge LP cutoff. Damping=0 → 5 kHz (open, bright); damping=1 →
    // 800 Hz (very damped, viola/cello tone). One-pole leak coefficient.
    const cutoff = 5000 - damping * 4200;
    const lpA = 1 - Math.exp((-2 * Math.PI * cutoff) / sampleRate);

    // String-loop loss. damping=0 → 0.999 (long sustain), damping=1 →
    // 0.985 (short sustain). Bounded so the loop never explodes.
    const loss = 0.985 + (1 - damping) * 0.014;

    // ── Pitch (octave-bug fix) ───────────────────────────────────────────
    // The bridge inverts polarity ONCE per round trip (`reflected = -…`), so a
    // wave must traverse the delay line TWICE to return in phase: the resonant
    // period is 2·delayLen and the fundamental is SR/(2·delayLen). The old code
    // sized delayLen = SR/freq, which sounded an OCTAVE LOW. Size it to
    // SR/(2·freq) so the string sounds the requested pitch. (The single
    // inversion also makes the loop odd-harmonic — a hollow/clarinet-tinged
    // bowed timbre — which is the model's inherent character, now in the right
    // octave.)
    const loopDelay = sampleRate / (2 * fHz);

    // The 1-pole bridge LP adds a frequency-dependent phase delay that lengthens
    // the loop and pulls the pitch FLAT (uncompensated: tens of cents, worsening
    // with frequency and damping). Subtract that phase delay (in samples,
    // evaluated at the fundamental) from the delay-line length so the TOTAL loop
    // length lands on target and the string tunes true across the range. Loss is
    // a pure gain (no phase), so only the LP contributes.
    const w0 = (2 * Math.PI * fHz) / sampleRate;
    const pole = 1 - lpA;
    const lpPhase = -Math.atan2(pole * Math.sin(w0), 1 - pole * Math.cos(w0));
    const lpPhaseDelay = -lpPhase / w0; // samples, ≥ 0

    // Fractional delay → sub-cent pitch accuracy (integer rounding was
    // ±50 cents at high notes). Same linear-interp tuning as braids-ks-pluck.
    const delayLen = Math.max(
      2,
      Math.min(maxDelay - 2, loopDelay - lpPhaseDelay),
    );
    const delayI = Math.floor(delayLen);
    const delayFr = delayLen - delayI;

    let writeIdx = this.writeIdx;
    let bridgeState = this.bridgeState;

    for (let i = 0; i < N; i++) {
      const bowVel = bowVelArr.length > 1 ? bowVelArr[i] : bowVelArr[0];

      // Read the wave returning from the bridge end (fractional tap).
      const ri0 = (writeIdx - delayI + maxDelay) % maxDelay;
      const ri1 = (ri0 - 1 + maxDelay) % maxDelay;
      const stringSample = buf[ri0] * (1 - delayFr) + buf[ri1] * delayFr;

      // Bridge: lowpass filter + sign flip (perfect reflection at the
      // boundary inverts polarity) + loss.
      bridgeState = bridgeState + lpA * (stringSample - bridgeState);
      const reflected = -bridgeState * loss;

      // Bow nonlinearity. v_rel = bow velocity − string velocity at bow
      // point. The 0.5 scale on `reflected` accounts for the wave/velocity
      // duality without unfolding the full v+/v- model.
      const vRel = bowVel - reflected * 0.5;
      const friction = bowFriction(vRel) * pressure;

      // Inject bow force into the string. The friction term is what
      // sustains the loop; without bow contact (bowVel=0, friction≈0)
      // the string decays via `loss`.
      buf[writeIdx] = reflected + friction;
      writeIdx = (writeIdx + 1) % maxDelay;

      // Output the bridge-filtered reflected wave. Slight makeup gain
      // since the wave amplitude in the loop is ~0.5 of perceived loudness.
      out[i] = reflected * 1.4;
    }

    // Denormal flush: with no bow contact the recursive bridge filter
    // decays toward subnormal, spiking CPU. One clamp per render quantum.
    if (bridgeState > -1e-30 && bridgeState < 1e-30) bridgeState = 0;

    this.writeIdx = writeIdx;
    this.bridgeState = bridgeState;
    return true;
  }
}

/** Sticky-slip bow friction approximation (Helmholtz mechanism).
 *  Returns a signed friction force in [−0.75, +0.75] for v_rel in [−1, +1].
 *  Peaks at v_rel ≈ 0 (string sticking to bow), drops exponentially as
 *  |v_rel| grows (string slipping). The +0.05 baseline ensures some bow
 *  drag during full slip — keeps the loop energized even at high
 *  oscillation amplitude. */
function bowFriction(vRel) {
  const v = vRel < 0 ? -vRel : vRel;
  const sticky = Math.exp(-v * 12);
  return (vRel < 0 ? -1 : 1) * (sticky * 0.7 + 0.05);
}

registerProcessor("braids-bowed", BowedProcessor);
