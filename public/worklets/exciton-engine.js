// Exciton-transport engine — a polyphonic synth built from the *math* of
// quantum-biology light-harvesting, with none of the mysticism. Each voice is a
// network of coupled resonators that moves energy between its nodes the way a
// photosynthetic complex (e.g. the 7-site Fenna–Matthews–Olson complex) moves an
// excitation from its antenna pigment to a "reaction-centre" sink.
//
// POLYPHONY: a fixed pool of MAX_VOICES voices, each owning its own 7-node
// stereo coupled network + amp ADSR. Global timbre params (coupling, coherence,
// …) are shared k-rate AudioParams; only the base frequency differs per voice.
//
// Per-voice DSP:
//   • MODAL RESONATOR BANK ("exciton transport"). N independent two-pole
//     resonators, one per partial (node i rings at EXACTLY f0·ratio[i]). The
//     strike/bow energy is *distributed across the modes* by `coupling`: node 0
//     (the antenna) gets the full excitation and each successive node toward the
//     SINK gets coupling^i of it — so `coupling` sets the spectral tilt /
//     harmonic richness, the audible analogue of how far the excitation migrates
//     along the chain. Keeping the modes independent keeps every note in tune for
//     any coupling; a state-coupled network (the old graph-Laplacian) splits the
//     modes off their target pitch — energy injected at f0 ended up ~2 octaves
//     sharp — so transport is modelled as excitation distribution, not as a term
//     folded into each resonator's recursion. VELOCITY brightens this tilt per
//     voice (a harder strike pushes energy further toward the higher modes), so
//     the instrument responds dynamically to touch — again without moving a pole.
//   • COHERENCE↔DECOHERENCE BREATHING. `coherence` sets base purity; an
//     exponential ring-time map turns purity into pole radius (purity 0 → ~4 ms
//     plink, purity 1 → ~1.2 s sustain). `decohereRate`/`decohereDepth` cycle the
//     purity, adding a signal-following grain (dephasing) that roughens a ringing
//     node WITHOUT perturbing its pole — additive ∝|y1|, so it is frequency-
//     neutral (the old multiplicative-on-state form biased low notes sharp).
//   • VIBRONIC FM, SINK TRAPPING, STEREO CORRELATION — as before.
//
// AMP ENVELOPE: each voice has an ADSR that shapes its output. Two articulations:
//   • struck (default): one-shot excitation burst, the network rings out; the
//     voice auto-reclaims once it has rung below RECLAIM_RMS.
//   • sustained: continuous low-level excitation while the key is held (a "bowed"
//     transport), so the note sustains for as long as it is held.
//
// MESSAGE PROTOCOL (control thread → worklet):
//   voiceOn  {id, freq, vel, a, d, s, r, sustained}
//   voiceOff {id}
//   setSustain {on}          — sustain-pedal hold
//   panic                    — silence all voices
//   (legacy: noteOn/noteOff map to a single mono voice for the old demo page)
//
// Real-time safety: the voice pool + all scratch arrays are allocated up front;
// process() performs no allocation. The periodic visualiser message reuses one
// preallocated array (postMessage copies it).

const MAX_VOICES = 8;
const N_NODES = 7;            // FMO has 7–8 bacteriochlorophylls; 7 is plenty.
const ANTENNA = 0;           // excitation is injected at this node
const SINK = N_NODES - 1;    // "reaction centre" — extra loss traps energy here

// 2^-31 — converts a signed int32 (xorshift output) to [-1, 1).
const INT32_TO_UNIT = 4.6566128730773926e-10;

// Inharmonic base ratios for the 7 site frequencies (a bell-ish modal set).
// `spread` morphs between harmonic integers (0) and this stretched set (1).
const MODAL_RATIOS = [1, 2.0, 3.01, 4.16, 5.43, 6.79, 8.21];
const HARMONIC_RATIOS = [1, 2, 3, 4, 5, 6, 7];

// Continuous excitation amplitude for the "sustained" (bowed) articulation.
const SUSTAIN_EXC_LEVEL = 0.12;

// Master soft-clip staging. The resonator sum runs hot; the OLD path
// (tanh(x·1.5)) slammed the saturator to its rails on every note, so the default
// tone was audibly distorted. We now drive tanh much more gently (so the body of
// the sound stays in its near-linear region — low THD) and apply a makeup gain to
// recover loudness, leaning on the downstream master peak-limiter to catch the
// occasional transient instead of using tanh as a brickwall.
const MASTER_DRIVE = 0.2;
const MASTER_MAKEUP = 1.8;
// A struck voice is reclaimed once its windowed output RMS drops below this.
const RECLAIM_RMS = 1.5e-4;

// Velocity → brightness. The excitation falloff toward the sink is `coupling`,
// but a real struck/bowed body also gets brighter the harder it's driven: more
// energy reaches the higher modes. We scale the per-voice falloff base by how
// far the note's velocity sits above/below VEL_REF, so a softly-played note
// stays darker and a hard one opens up — WITHOUT moving any pole (pitch is
// untouched). MULTIPLICATIVE on `coupling`, so a pure voice (coupling 0) stays
// pure at any velocity: touch modulates the existing spectral tilt, it doesn't
// invent one. Centred at VEL_REF a normally-played note sounds as before;
// EXC_BASE_MAX caps the geometric spread so it stays convergent/bounded.
const VEL_BRIGHT = 0.6; // fractional brightening per unit velocity above VEL_REF
const VEL_REF = 0.8;
const EXC_BASE_MAX = 0.82;

// Envelope stages.
const IDLE = 0, ATTACK = 1, DECAY = 2, SUSTAIN = 3, RELEASE = 4;

// Voice allocation mode. POLY = the historical polyphonic engine (default, so the
// neutral instrument is byte-identical). MONO = one voice, retriggered (multi-
// trigger) per note. LEGATO = one voice that glides to an overlapping note with no
// re-attack (the portamento lead). Both mono modes keep a held-note stack for
// last-note priority (releasing the top note resumes the most-recent held one).
const VM_POLY = 0, VM_MONO = 1, VM_LEGATO = 2;
const VM_CODES = { poly: VM_POLY, mono: VM_MONO, legato: VM_LEGATO };
const LEGACY_ID = -1; // fixed voice id for the legacy mono noteOn/noteOff path

// --- Exciter sources -------------------------------------------------------
// Historically the resonator bank was struck by white noise only, so the modes
// were the sole source of spectrum (great for bells/pads, but it can never reach
// pitched, harmonically-rich tones). `exciterBlend` fades from that noise (0) to
// a tonal source (1): a band-limited oscillator at f0 (or a clean impulse), so
// the modes become a *formant filter* over a rich source — unlocking organ /
// brass / reed / pluck-with-body / vocal timbres. Codes stay numeric for the hot
// loop; the control thread selects the source by name (setExciter message).
const EXC_SAW = 0, EXC_SQUARE = 1, EXC_TRIANGLE = 2, EXC_SINE = 3, EXC_IMPULSE = 4;
const EXCITER_CODES = { saw: EXC_SAW, square: EXC_SQUARE, triangle: EXC_TRIANGLE, sine: EXC_SINE, impulse: EXC_IMPULSE };
// Per-source level trims (indexed by code) so the noise↔tonal Blend sweep has no
// loudness jump — noise is unit-weighted, so saw (same ~0.577 RMS) is the 1.0
// reference; square is the loudest (pulled down), sine concentrates all energy on
// mode 0's pole (pulled down), triangle/impulse roughly matched. Ear-tuned.
const EXC_TRIM = [1.0, 0.6, 1.0, 0.8, 1.0]; // [saw, square, triangle, sine, impulse]
const TWO_PI = 2 * Math.PI;

// --- Per-voice filter / sub / unison (engine-depth) constants ---
const FILTER_MIN_HZ = 60, FILTER_MAX_HZ = 18000;
const FILTER_RATIO = FILTER_MAX_HZ / FILTER_MIN_HZ; // log-sweep span for the cutoff map
const SUB_OCTAVE = 0.5;   // sub-oscillator rings one octave below the played pitch
const SUB_GAIN = 2.4;     // makeup so a full Sub roughly matches the modal body
const MAX_UNISON = 3;     // detuned voices stacked per note at most

// PolyBLEP residual — softens the one-sample step of a naive saw/square so a
// *pitched* exciter doesn't alias. t = phase ∈ [0,1), dt = phase increment/sample.
function polyBlep(t, dt) {
  if (dt <= 0) return 0;
  if (t < dt) { const x = t / dt; return x + x - x * x - 1; }
  if (t > 1 - dt) { const x = (t - 1) / dt; return x * x + x + x + 1; }
  return 0;
}

class ExcitonVoice {
  constructor() {
    // Per-node biquad state (stereo) and per-node a1 coefficient (per quantum).
    this.y1L = new Float64Array(N_NODES);
    this.y2L = new Float64Array(N_NODES);
    this.y1R = new Float64Array(N_NODES);
    this.y2R = new Float64Array(N_NODES);
    this.a1 = new Float64Array(N_NODES);
    this.excW = new Float64Array(N_NODES); // per-mode excitation weights (vel-tilted)

    this.active = false;
    this.held = false;       // key physically down (drives sustained excitation)
    this.pedalHeld = false;  // sustain pedal is holding this released note
    this.sustained = false;  // articulation: bowed (true) vs struck (false)
    this.noteId = 0;
    this.f0 = 110;           // target frequency (the played pitch)
    this.curLnF0 = Math.log(110); // current glide position, in log-Hz
    this.vel = 1;

    this.stage = IDLE;
    this.level = 0;          // amp env level [0,1]
    this.attackInc = 1;
    this.decayCoef = 0;
    this.sustainLevel = 1;
    this.releaseCoef = 0;

    // Dedicated FILTER envelope — its own ADSR driving the cutoff (independent of
    // the amp env). Defaults to mirroring the amp ADSR when a note carries no
    // fa/fd/fs/fr (so the historical "filter tracks the amp env" behaviour stands).
    this.fStage = IDLE;
    this.fLevel = 0;         // filter env level [0,1]
    this.fAttackInc = 1;
    this.fDecayCoef = 0;
    this.fSustainLevel = 1;
    this.fReleaseCoef = 0;

    this.excRemain = 0;      // remaining attack-burst samples
    this.excGain = 0;
    this.excDecay = 0;

    this.excPhase = 0;       // tonal-exciter oscillator phase [0,1)
    this.phaseInc = 0;       // per-block phase increment (f0·vibMul / sampleRate)
    this.impulseArmed = false; // impulse source fires once, within the attack burst

    // Per-voice low-pass (TPT state-variable filter): integrator state (stereo) +
    // per-block coefficients. Sub-oscillator phase/increment. Unison detune + pan.
    this.fIc1L = 0; this.fIc2L = 0; this.fIc1R = 0; this.fIc2R = 0;
    this.fA1 = 0; this.fA2 = 0; this.fA3 = 0;
    this.subPhase = 0; this.subInc = 0;
    this.detuneStep = 0;     // unison position × detune cents (0 = centre voice)
    this.panL = 1; this.panR = 1; // unison stereo pan (1,1 = centred / no-op)

    this.rmsAccum = 0;       // Σ output² over the viz window, for reclaim
  }

  clearState() {
    this.y1L.fill(0); this.y2L.fill(0);
    this.y1R.fill(0); this.y2R.fill(0);
    this.level = 0; this.rmsAccum = 0;
    this.fLevel = 0;
    this.excPhase = 0; this.impulseArmed = false;
    this.fIc1L = 0; this.fIc2L = 0; this.fIc1R = 0; this.fIc2R = 0;
    this.subPhase = 0;
  }
}

class ExcitonEngine extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'coupling',      defaultValue: 0.25, minValue: 0,  maxValue: 0.6, automationRate: 'k-rate' },
      { name: 'coherence',     defaultValue: 0.85, minValue: 0,  maxValue: 1,   automationRate: 'k-rate' },
      { name: 'decohereRate',  defaultValue: 0.6,  minValue: 0,  maxValue: 20,  automationRate: 'k-rate' },
      { name: 'decohereDepth', defaultValue: 0.5,  minValue: 0,  maxValue: 1,   automationRate: 'k-rate' },
      { name: 'vibronic',      defaultValue: 0.0,  minValue: 0,  maxValue: 1,   automationRate: 'k-rate' },
      { name: 'vibronicRate',  defaultValue: 6,    minValue: 0.1,maxValue: 80,  automationRate: 'k-rate' },
      { name: 'sinkDrain',     defaultValue: 0.4,  minValue: 0,  maxValue: 1,   automationRate: 'k-rate' },
      { name: 'spread',        defaultValue: 0.2,  minValue: 0,  maxValue: 1,   automationRate: 'k-rate' },
      { name: 'stereoCorr',    defaultValue: -0.3, minValue: -1, maxValue: 1,   automationRate: 'k-rate' },
      { name: 'gain',          defaultValue: 0.5,  minValue: 0,  maxValue: 1,   automationRate: 'k-rate' },
      // Noise (0) ↔ tonal exciter source (1). 0 reproduces the historical
      // noise-only excitation exactly; mod-routable like any other timbre param.
      { name: 'exciterBlend',  defaultValue: 0,    minValue: 0,  maxValue: 1,   automationRate: 'k-rate' },
      // Source-shape morph (def 0.5 = neutral). Square ⇒ pulse width; Triangle ⇒
      // peak skew; no-op for saw/sine/impulse. Mapped to a duty in process().
      { name: 'exciterShape',  defaultValue: 0.5,  minValue: 0,  maxValue: 1,   automationRate: 'k-rate' },
      // Portamento time (s). 0 ⇒ instant (each note's poles snap to pitch, the
      // historical behaviour). >0 ⇒ a voice glides in log-pitch from the last
      // note toward its target over ~this time constant.
      { name: 'glide',         defaultValue: 0,    minValue: 0,  maxValue: 2,   automationRate: 'k-rate' },
      // Velocity → brightness depth. How much a harder strike pushes excitation
      // toward the higher modes. 0.6 reproduces the historic fixed sensitivity.
      { name: 'velSense',      defaultValue: 0.6,  minValue: 0,  maxValue: 1,   automationRate: 'k-rate' },
      // Global pitch-bend in semitones (MIDI wheel). Smoothed, multiplies every
      // voice's effective frequency; not persisted (a transient performance gesture).
      { name: 'bend',          defaultValue: 0,    minValue: -12, maxValue: 12,  automationRate: 'k-rate' },
      // --- Per-voice subtractive filter + sub + unison detune (Bundle: engine depth) ---
      // Per-voice low-pass cutoff, normalised 0..1 (log-mapped to 60 Hz..18 kHz).
      // 1 = open ⇒ with env 0 + reso 0 the filter is bypassed (bit-identical default).
      { name: 'filterFreq',    defaultValue: 1,    minValue: 0,  maxValue: 1,   automationRate: 'k-rate' },
      // Filter resonance 0..1 (Q ≈ 0.7 → 6).
      { name: 'filterReso',    defaultValue: 0,    minValue: 0,  maxValue: 1,   automationRate: 'k-rate' },
      // Filter envelope amount: how much the amp envelope opens (+) / closes (−)
      // the cutoff per voice — the subtractive "pluck" sweep. 0 = static filter.
      { name: 'filterEnvAmt',  defaultValue: 0,    minValue: -1, maxValue: 1,   automationRate: 'k-rate' },
      // Sub-oscillator level: a clean octave-below sine mixed in per voice for body.
      { name: 'sub',           defaultValue: 0,    minValue: 0,  maxValue: 1,   automationRate: 'k-rate' },
      // Unison detune spread in cents (applied to the ± detuned unison voices).
      { name: 'detune',        defaultValue: 0,    minValue: 0,  maxValue: 50,  automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();
    this.voices = [];
    for (let i = 0; i < MAX_VOICES; i++) this.voices.push(new ExcitonVoice());

    this.a2 = new Float64Array(N_NODES);      // per-node feedback coeff (global)
    this.ratios = new Float64Array(N_NODES);  // current spread-morphed ratios
    this.nodeAccum = new Float64Array(N_NODES); // aggregate per-node energy (viz)

    this.lastSpread = -1;
    this.lfoPhase = 0;
    this.vibPhase = 0;
    this.lastF0 = 0;          // most recent target pitch — the glide origin for the next note
    this.sustainPedal = false;
    this.exciterCode = EXC_SAW; // tonal source Blend fades toward (noise is blend 0)
    this.unison = 1;          // detuned voices stacked per note (1 = off / classic)
    this._slots = [];         // reused scratch for unison slot allocation (no per-note alloc)

    // Mono / legato state (unused while voiceMode === VM_POLY).
    this.voiceMode = VM_POLY;
    this.monoStack = [];      // held voiceOn messages, most-recent last (note priority)
    this.monoStackLen = 0;    // logical length (the array is a reused capacity buffer)
    this.monoVoice = null;    // the single sounding voice in mono/legato
    this.monoCurId = -1;      // id currently sounding (-1 = silent)

    // Independent xorshift32 RNG streams for L/R dephasing + excitation noise.
    this.rngL = 0x9e3779b9 | 0;
    this.rngR = 0x85ebca77 | 0;

    // Master DC blockers (one per channel) on the summed mix.
    this.dcXL = 0; this.dcYL = 0;
    this.dcXR = 0; this.dcYR = 0;

    this.report = new Array(N_NODES + 1).fill(0);
    this.reportCounter = 0;

    this.setSpread(0.2);
    this.port.onmessage = (ev) => this.handleMessage(ev.data);
  }

  setSpread(spread) {
    for (let i = 0; i < N_NODES; i++) {
      this.ratios[i] = HARMONIC_RATIOS[i] + (MODAL_RATIOS[i] - HARMONIC_RATIOS[i]) * spread;
    }
    this.lastSpread = spread;
  }

  allocVoice(id) {
    // Retrigger the voice already playing this note (mono-per-pitch).
    for (let i = 0; i < MAX_VOICES; i++) {
      const v = this.voices[i];
      if (v.active && v.noteId === id) return v;
    }
    // Otherwise take a free voice…
    for (let i = 0; i < MAX_VOICES; i++) {
      if (!this.voices[i].active) return this.voices[i];
    }
    // …or steal the quietest active voice.
    let min = Infinity, pick = this.voices[0];
    for (let i = 0; i < MAX_VOICES; i++) {
      const v = this.voices[i];
      if (v.level < min) { min = v.level; pick = v; }
    }
    return pick;
  }

  handleMessage(m) {
    switch (m.type) {
      case 'voiceOn':   this.voiceOn(m); break;
      case 'voiceOff':  this.voiceOff(m.id | 0); break;
      case 'setSustain': this.setSustainPedal(!!m.on); break;
      case 'setExciter': { const c = EXCITER_CODES[m.source]; if (c != null) this.exciterCode = c; break; }
      case 'setUnison': { const c = m.count | 0; this.unison = c < 1 ? 1 : c > MAX_UNISON ? MAX_UNISON : c; break; }
      case 'setVoiceMode': this.setVoiceMode(m.mode); break;
      case 'panic':     this.panic(); break;
      // Legacy single-voice path for the original demo page.
      case 'noteOn':
        this.voiceOn({ id: LEGACY_ID, freq: m.freq, vel: m.vel, sustained: false });
        break;
      case 'noteOff':
        this.voiceOff(LEGACY_ID);
        break;
    }
  }

  /** Pick a slot not already in `exclude`: a free one first, else the quietest. */
  allocFreeSlot(exclude) {
    for (let i = 0; i < MAX_VOICES; i++) {
      const v = this.voices[i];
      if (!v.active && exclude.indexOf(v) < 0) return v;
    }
    let min = Infinity, pick = null;
    for (let i = 0; i < MAX_VOICES; i++) {
      const v = this.voices[i];
      if (exclude.indexOf(v) >= 0) continue;
      if (v.level < min) { min = v.level; pick = v; }
    }
    return pick || this.voices[0];
  }

  voiceOn(m) {
    if (this.voiceMode !== VM_POLY) { this.monoNoteOn(m); return; }
    const id = m.id | 0;
    const count = this.unison;
    if (count <= 1) {
      this.initVoice(this.allocVoice(id), id, m, 0, 1, 1);
      this.lastF0 = m.freq > 0 ? m.freq : this.lastF0;
      return;
    }
    // Unison: retrigger this note's existing slots if any, else allocate `count`
    // fresh ones. Slot scratch is reused so a note-on never allocates.
    const slots = this._slots;
    slots.length = 0;
    for (let i = 0; i < MAX_VOICES; i++) {
      const v = this.voices[i];
      if (v.active && v.noteId === id) slots.push(v);
    }
    if (slots.length === 0) {
      for (let u = 0; u < count; u++) slots.push(this.allocFreeSlot(slots));
    }
    const last = slots.length - 1;
    for (let u = 0; u < slots.length; u++) {
      // Centred detune spread (e.g. −1, 0, +1) and an equal-power stereo pan.
      const step = last > 0 ? (u - last / 2) : 0;
      const pos = last > 0 ? step / (last / 2) : 0; // −1..+1
      const ang = (pos + 1) * Math.PI / 4;
      this.initVoice(slots[u], id, m, step, Math.cos(ang), Math.sin(ang));
    }
    this.lastF0 = m.freq > 0 ? m.freq : this.lastF0;
  }

  /** Arm one voice slot for a note (with a unison detune step + stereo pan).
   *  `forceRetrig` makes a mono voice re-attack in place (keep ring + glide origin)
   *  even though the note id changed — a click-free multi-trigger. */
  initVoice(v, id, m, detuneStep, panL, panR, forceRetrig) {
    const retrig = forceRetrig || (v.active && v.noteId === id);
    if (!retrig) v.clearState(); // new note or stolen slot → start clean (no click)

    v.active = true;
    v.held = true;
    v.pedalHeld = false;
    v.sustained = !!m.sustained;
    v.noteId = id;
    if (m.freq > 0) v.f0 = m.freq;
    v.detuneStep = detuneStep;
    v.panL = panL; v.panR = panR;
    // Glide origin: a fresh voice starts at the last-played pitch (so legato lines
    // portamento toward their target); a retrigger keeps its glide position. At
    // glide 0 the per-block slew snaps to target on the first block → inaudible.
    if (!retrig) {
      const origin = this.lastF0 > 0 ? this.lastF0 : v.f0;
      v.curLnF0 = Math.log(origin);
    }
    v.vel = m.vel != null ? m.vel : 1;

    const sr = sampleRate;
    const a = Math.max(0, m.a != null ? m.a : 8);
    const d = Math.max(0, m.d != null ? m.d : 150);
    const s = Math.min(1, Math.max(0, m.s != null ? m.s : 0.7));
    const r = Math.max(1, m.r != null ? m.r : 300);
    v.attackInc = 1 / Math.max(1, a * sr / 1000);
    v.decayCoef = Math.exp(-1 / Math.max(1, d * sr / 1000));
    v.sustainLevel = s;
    v.releaseCoef = Math.exp(-1 / Math.max(1, r * sr / 1000));
    v.stage = ATTACK;

    // Filter envelope — its own ADSR. Absent fa/fd/fs/fr ⇒ mirror the amp ADSR,
    // so a note with no explicit filter env reproduces the historical behaviour
    // (cutoff follows the amp env). Retrigger keeps fLevel; a fresh/stolen slot
    // started it at 0 in clearState (exactly like the amp env).
    const fa = Math.max(0, m.fa != null ? m.fa : a);
    const fd = Math.max(0, m.fd != null ? m.fd : d);
    const fsv = Math.min(1, Math.max(0, m.fs != null ? m.fs : s));
    const fr = Math.max(1, m.fr != null ? m.fr : r);
    v.fAttackInc = 1 / Math.max(1, fa * sr / 1000);
    v.fDecayCoef = Math.exp(-1 / Math.max(1, fd * sr / 1000));
    v.fSustainLevel = fsv;
    v.fReleaseCoef = Math.exp(-1 / Math.max(1, fr * sr / 1000));
    v.fStage = ATTACK;

    // ~8 ms excitation burst injected at the antenna node.
    v.excRemain = Math.max(1, Math.floor(0.008 * sr));
    v.excGain = v.vel;
    v.excDecay = Math.exp(-1 / (0.004 * sr));
    // Arm the impulse source so (when selected + blended in) it fires one clean
    // sample inside the attack burst; struck-only by nature.
    v.impulseArmed = true;
  }

  voiceOff(id) {
    if (this.voiceMode !== VM_POLY) { this.monoNoteOff(id); return; }
    for (let i = 0; i < MAX_VOICES; i++) {
      const v = this.voices[i];
      if (v.active && v.noteId === id && v.held) {
        v.held = false;
        if (this.sustainPedal) v.pedalHeld = true;
        else { v.stage = RELEASE; v.fStage = RELEASE; }
      }
    }
  }

  // --- mono / legato note handling -----------------------------------------

  setVoiceMode(mode) {
    const code = VM_CODES[mode] != null ? VM_CODES[mode] : VM_POLY;
    if (code === this.voiceMode) return;
    // Release everything held so no voice is orphaned across the allocation-policy
    // change (a deliberate mode switch stops current notes; re-press to play anew).
    for (let i = 0; i < MAX_VOICES; i++) {
      const v = this.voices[i];
      if (v.active && v.held) { v.held = false; v.stage = RELEASE; v.fStage = RELEASE; }
    }
    this.monoStackLen = 0;
    this.monoVoice = null;
    this.monoCurId = -1;
    this.voiceMode = code;
  }

  /** Push a held note (remove any prior entry for the same id, then append as the
   *  most-recent). Stores the message reference — no clone, so it's alloc-free. */
  monoStackPush(m, id) {
    this.monoStackRemove(id);
    this.monoStack[this.monoStackLen++] = m;
  }

  monoStackRemove(id) {
    let w = 0;
    for (let r = 0; r < this.monoStackLen; r++) {
      const e = this.monoStack[r];
      if ((e.id | 0) !== id) this.monoStack[w++] = e;
    }
    this.monoStackLen = w;
  }

  /** Retarget the mono voice to a new pitch WITHOUT re-attacking — the legato
   *  glide. The per-block slew slides curLnF0 toward the new f0 over the glide
   *  time; envelope, excitation burst and ring are all left untouched. */
  monoRetarget(v, m, id) {
    if (m.freq > 0) v.f0 = m.freq;
    v.noteId = id;
    if (m.vel != null) v.vel = m.vel;
    v.held = true;
    v.pedalHeld = false;
  }

  monoNoteOn(m) {
    const id = m.id | 0;
    this.monoStackPush(m, id);
    let v = this.monoVoice;
    if (this.voiceMode === VM_LEGATO && v && v.active && v.held) {
      // Overlap in legato → glide to the new note, no re-attack.
      this.monoRetarget(v, m, id);
    } else {
      // Mono (always) or legato with nothing sounding → (re)trigger one voice.
      // Reuse the still-active mono voice for a click-free in-place re-attack;
      // otherwise grab a fresh slot and attack from silence.
      const reuse = !!(v && v.active);
      if (!reuse) v = this.allocVoice(id);
      this.initVoice(v, id, m, 0, 1, 1, reuse);
      this.monoVoice = v;
    }
    this.monoVoice = v;
    this.monoCurId = id;
    this.lastF0 = m.freq > 0 ? m.freq : this.lastF0;
  }

  monoNoteOff(id) {
    this.monoStackRemove(id);
    if (id !== this.monoCurId) return; // a held lower note released; sounding note stands
    const v = this.monoVoice;
    if (!v) return;
    if (this.monoStackLen > 0) {
      // Last-note priority: resume the most-recent still-held note.
      const top = this.monoStack[this.monoStackLen - 1];
      const topId = top.id | 0;
      if (this.voiceMode === VM_LEGATO) this.monoRetarget(v, top, topId);
      else this.initVoice(v, topId, top, 0, 1, 1, true);
      this.monoCurId = topId;
      this.lastF0 = top.freq > 0 ? top.freq : this.lastF0;
    } else {
      // Nothing held → release the mono voice (honouring the sustain pedal).
      v.held = false;
      if (this.sustainPedal) v.pedalHeld = true;
      else { v.stage = RELEASE; v.fStage = RELEASE; }
      this.monoCurId = -1;
    }
  }

  setSustainPedal(on) {
    this.sustainPedal = on;
    if (!on) {
      for (let i = 0; i < MAX_VOICES; i++) {
        const v = this.voices[i];
        if (v.pedalHeld) { v.pedalHeld = false; v.stage = RELEASE; v.fStage = RELEASE; }
      }
    }
  }

  panic() {
    for (let i = 0; i < MAX_VOICES; i++) {
      const v = this.voices[i];
      v.active = false; v.held = false; v.pedalHeld = false;
      v.stage = IDLE; v.fStage = IDLE; v.clearState();
    }
    // Reset the mono note-stack so a panic clears any held-note priority too.
    this.monoStackLen = 0; this.monoVoice = null; this.monoCurId = -1;
    // Also discharge the master DC blockers so an emergency stop is click-free
    // (otherwise the high-pass state thumps out after the abrupt cut).
    this.dcXL = 0; this.dcYL = 0; this.dcXR = 0; this.dcYR = 0;
  }

  activeCount() {
    let c = 0;
    for (let i = 0; i < MAX_VOICES; i++) if (this.voices[i].active) c++;
    return c;
  }

  process(_inputs, outputs, parameters) {
    const out = outputs[0];
    if (!out || out.length === 0) return true;
    const outL = out[0];
    const outR = out.length > 1 ? out[1] : out[0];
    const n = outL.length;

    const coupling = parameters.coupling[0];
    const coherence = parameters.coherence[0];
    const decohereRate = parameters.decohereRate[0];
    const decohereDepth = parameters.decohereDepth[0];
    const vibronic = parameters.vibronic[0];
    const vibronicRate = parameters.vibronicRate[0];
    const sinkDrain = parameters.sinkDrain[0];
    const spread = parameters.spread[0];
    const stereoCorr = parameters.stereoCorr[0];
    const gain = parameters.gain[0];
    const exciterBlend = parameters.exciterBlend[0];
    const exciterCode = this.exciterCode;
    const wNoise = 1 - exciterBlend; // noise weight (1 ⇒ historical noise-only path)
    // Shape → duty/peak position for square & triangle. Map 0..1 → [0.05, 0.95]
    // (avoid the degenerate 0/1 duty) so 0.5 ⇒ 0.5 = the neutral symmetric wave,
    // keeping the default tone bit-identical to the pre-shape square/triangle.
    const exciterShape = parameters.exciterShape[0];
    const excDuty = 0.05 + 0.9 * exciterShape;
    const excDutyDC = 2 * excDuty - 1; // DC of a width-`excDuty` ±1 pulse (removed below)
    const glideTime = parameters.glide[0];
    const velSense = parameters.velSense[0];
    const bendMul = Math.pow(2, parameters.bend[0] / 12); // semitones → freq ratio
    // Glide coefficient = fraction of the log-pitch gap that REMAINS after this
    // block (one time-constant ≈ glideTime). 0 ⇒ snap to target on the first
    // block, so glide 0 is the historical instant-pitch behaviour.
    const glideCoef = glideTime > 0.0005 ? Math.exp(-(n / sampleRate) / glideTime) : 0;
    // Per-voice filter / sub / unison-detune (engine depth).
    const filterFreqBase = parameters.filterFreq[0];
    const filterReso = parameters.filterReso[0];
    const filterEnvAmt = parameters.filterEnvAmt[0];
    const subLevel = parameters.sub[0];
    const detuneCents = parameters.detune[0];
    // Skip the whole per-voice filter when it's neutral (open + no env + no reso),
    // so the default render stays bit-identical and zero-cost.
    const filterActive = filterFreqBase < 0.999 || filterEnvAmt !== 0 || filterReso > 0.001;
    // When the filter envelope actually moves the cutoff (Env amt ≠ 0) we run it
    // per-sample for a zipper-free sweep; otherwise the cutoff is static and the
    // SVF coefficients are fixed once per block (bit-identical to the old path).
    const filterEnvActive = filterActive && filterEnvAmt !== 0;
    const svfK = 1 / (0.7 + filterReso * 5.3); // TPT SVF damping k = 1/Q
    const filterNyq = sampleRate * 0.49;

    if (spread !== this.lastSpread) this.setSpread(spread);

    // --- k-rate: coherence breathing + vibronic FM → coefficients ---
    this.lfoPhase += 2 * Math.PI * decohereRate / sampleRate * n;
    if (this.lfoPhase > 2 * Math.PI) this.lfoPhase -= 2 * Math.PI;
    const breath = 0.5 - 0.5 * Math.cos(this.lfoPhase);
    const purity = Math.max(0, coherence * (1 - decohereDepth * breath));
    // Exponential ring-time map: purity 0 → ~4 ms, purity 1 → ~1.2 s.
    const tau = 0.004 * Math.pow(300, purity);
    const poleR = Math.min(0.99998, Math.exp(-1 / (tau * sampleRate)));
    const rSink = Math.max(0, poleR - 0.03 * sinkDrain);
    const dephase = (1 - purity) * 0.015;

    this.vibPhase += 2 * Math.PI * vibronicRate / sampleRate * n;
    if (this.vibPhase > 2 * Math.PI) this.vibPhase -= 2 * Math.PI;
    const vibMul = 1 + vibronic * 0.03 * Math.sin(this.vibPhase);

    // Global per-node a2 (depends only on pole radius / sink).
    const a2 = this.a2;
    for (let i = 0; i < N_NODES; i++) {
      const r = (i === SINK) ? rSink : poleR;
      a2[i] = -(r * r);
    }
    // Per-voice per-node a1 (depends on the voice's base frequency).
    const twoPiVibSr = 2 * Math.PI * vibMul / sampleRate;
    const ratios = this.ratios;
    for (let vi = 0; vi < MAX_VOICES; vi++) {
      const v = this.voices[vi];
      if (!v.active) continue;
      // Glide the voice's pitch toward its target in log-Hz (a constant rate in
      // cents), apply the global pitch-bend, then the unison detune offset.
      // `effF0` drives the modal poles, the tonal exciter AND the sub so they all
      // stay locked together as it slides.
      const lnTarget = Math.log(v.f0);
      v.curLnF0 = lnTarget + (v.curLnF0 - lnTarget) * glideCoef;
      const detuneRatio = (detuneCents > 0 && v.detuneStep !== 0)
        ? Math.pow(2, (v.detuneStep * detuneCents) / 1200) : 1;
      const effF0 = Math.exp(v.curLnF0) * bendMul * detuneRatio;
      const a1 = v.a1;
      for (let i = 0; i < N_NODES; i++) {
        const r = (i === SINK) ? rSink : poleR;
        a1[i] = 2 * r * Math.cos(twoPiVibSr * effF0 * ratios[i]);
      }
      // Tonal exciter pitch tracks vibronic + glide + bend exactly like the modes
      // (fundamental = vibMul·effF0), so a blended-in oscillator stays locked to
      // mode 0's pole.
      v.phaseInc = vibMul * effF0 / sampleRate;
      // Sub-oscillator increment: one octave below the effective pitch.
      v.subInc = effF0 * SUB_OCTAVE / sampleRate;
      // Per-voice low-pass coefficients (TPT SVF). With the filter env inactive
      // (Env amt 0) the cutoff is static at filterFreqBase, so the coefficients are
      // fixed once per block here — bit-identical to the historical static filter.
      // When the env IS active the cutoff is env-driven and recomputed per-sample
      // (below), so this per-block pass is skipped. Skipped entirely — and left
      // bit-identical — when the filter is neutral.
      if (filterActive && !filterEnvActive) {
        let cn = filterFreqBase;
        if (cn < 0) cn = 0; else if (cn > 1) cn = 1;
        let fc = FILTER_MIN_HZ * Math.pow(FILTER_RATIO, cn);
        if (fc > filterNyq) fc = filterNyq;
        const g = Math.tan(Math.PI * fc / sampleRate);
        const a1f = 1 / (1 + g * (g + svfK));
        v.fA1 = a1f; v.fA2 = g * a1f; v.fA3 = g * (g * a1f);
      }
      // Excitation weights: `coupling` tilts how much strike/bow energy reaches
      // each successive mode (node 0 = full, geometric falloff to the sink),
      // brightened by this voice's velocity scaled by `velSense`. Per-voice +
      // k-rate (once per block). velSense 0.6 ⇒ the historic fixed sensitivity.
      let base = coupling * (1 + (v.vel - VEL_REF) * velSense);
      if (base < 0) base = 0; else if (base > EXC_BASE_MAX) base = EXC_BASE_MAX;
      const excW = v.excW;
      for (let i = 0; i < N_NODES; i++) excW[i] = Math.pow(base, i);
    }

    const norm = 0.5 / Math.sqrt(N_NODES);
    const cMix = Math.sqrt(Math.max(0, 1 - stereoCorr * stereoCorr));
    let rngL = this.rngL, rngR = this.rngR;
    const nodeAccum = this.nodeAccum;

    for (let s = 0; s < n; s++) {
      let mixL = 0, mixR = 0;

      for (let vi = 0; vi < MAX_VOICES; vi++) {
        const v = this.voices[vi];
        if (!v.active) continue;

        // --- amp envelope ---
        switch (v.stage) {
          case ATTACK:
            v.level += v.attackInc;
            if (v.level >= 1) { v.level = 1; v.stage = DECAY; }
            break;
          case DECAY:
            v.level = v.sustainLevel + (v.level - v.sustainLevel) * v.decayCoef;
            if (v.level <= v.sustainLevel + 1e-4) { v.level = v.sustainLevel; v.stage = SUSTAIN; }
            break;
          case SUSTAIN:
            break;
          case RELEASE:
            v.level *= v.releaseCoef;
            if (v.level < 1e-4) { v.active = false; }
            break;
        }
        if (!v.active) continue;

        // --- filter envelope (own ADSR) ---
        // Advanced whenever the filter runs so fLevel always tracks the note; the
        // cutoff only reads it when the env is active (recomputed per-sample below).
        // Never deactivates the voice — the amp env owns the voice lifecycle.
        if (filterActive) {
          switch (v.fStage) {
            case ATTACK:
              v.fLevel += v.fAttackInc;
              if (v.fLevel >= 1) { v.fLevel = 1; v.fStage = DECAY; }
              break;
            case DECAY:
              v.fLevel = v.fSustainLevel + (v.fLevel - v.fSustainLevel) * v.fDecayCoef;
              if (v.fLevel <= v.fSustainLevel + 1e-4) { v.fLevel = v.fSustainLevel; v.fStage = SUSTAIN; }
              break;
            case SUSTAIN:
              break;
            case RELEASE:
              v.fLevel *= v.fReleaseCoef;
              if (v.fLevel < 1e-5) v.fLevel = 0;
              break;
          }
        }

        // --- excitation injected at the antenna ---
        // Source = noise·wNoise + tonal·exciterBlend. The two noise draws stay in
        // their original burst/sustain branches, so at exciterBlend 0 (wNoise 1,
        // tonal 0) the drive is bit-identical to the historical noise-only engine.
        let tonal = 0;
        if (exciterBlend > 0) {
          const ph = v.excPhase, inc = v.phaseInc;
          switch (exciterCode) {
            case EXC_SAW:
              tonal = (2 * ph - 1) - polyBlep(ph, inc);
              break;
            case EXC_SQUARE: {
              // Variable-width pulse: +1 while ph < duty, −1 after. PolyBLEP the
              // rising edge (ph=0) and the falling edge (ph=duty); then subtract
              // the pulse's DC (2·duty−1) so the all-pole resonators never build a
              // DC component when duty≠0.5. duty 0.5 ⇒ the original 50% square.
              let sq = ph < excDuty ? 1 : -1;
              sq += polyBlep(ph, inc);
              let ph2 = ph - excDuty; if (ph2 < 0) ph2 += 1;
              sq -= polyBlep(ph2, inc);
              tonal = sq - excDutyDC;
              break;
            }
            case EXC_TRIANGLE: {
              // Asymmetric triangle peaking +1 at ph=duty, −1 at the period ends.
              // Piecewise-linear between fixed endpoints, so it stays zero-mean at
              // every duty (each leg averages 0); duty 0.5 ⇒ the symmetric triangle.
              tonal = ph < excDuty
                ? -1 + 2 * (ph / excDuty)
                : 1 - 2 * ((ph - excDuty) / (1 - excDuty));
              break;
            }
            case EXC_SINE:
              tonal = Math.sin(TWO_PI * ph);
              break;
            case EXC_IMPULSE:
              // Fires one sample, only inside the attack burst → an attack-only
              // transient (no stray click if Blend is swept up mid-note).
              if (v.impulseArmed && v.excRemain > 0) { tonal = 1; v.impulseArmed = false; }
              break;
          }
          tonal *= EXC_TRIM[exciterCode];
          v.excPhase = ph + inc; if (v.excPhase >= 1) v.excPhase -= 1;
        }

        let drive = 0;
        if (v.excRemain > 0) {
          rngL = (rngL ^ (rngL << 13)); rngL ^= (rngL >>> 17); rngL ^= (rngL << 5);
          drive += ((rngL * INT32_TO_UNIT) * wNoise + tonal * exciterBlend) * v.excGain;
          v.excGain *= v.excDecay; v.excRemain--;
        }
        if (v.sustained && v.held) {
          rngL = (rngL ^ (rngL << 13)); rngL ^= (rngL >>> 17); rngL ^= (rngL << 5);
          drive += ((rngL * INT32_TO_UNIT) * wNoise + tonal * exciterBlend) * v.vel * SUSTAIN_EXC_LEVEL;
        }

        const y1L = v.y1L, y2L = v.y2L, y1R = v.y1R, y2R = v.y2R, a1 = v.a1, excW = v.excW;

        let vL = 0, vR = 0;
        for (let i = 0; i < N_NODES; i++) {
          rngL = (rngL ^ (rngL << 13)); rngL ^= (rngL >>> 17); rngL ^= (rngL << 5);
          const nL = rngL * INT32_TO_UNIT;
          rngR = (rngR ^ (rngR << 13)); rngR ^= (rngR >>> 17); rngR ^= (rngR << 5);
          const nRind = rngR * INT32_TO_UNIT;
          const nR = stereoCorr * nL + cMix * nRind;

          // Modal transport: the excitation is the only inter-node link — node i
          // gets excW[i] of the drive, then rings independently at f0·ratio[i].
          const inj = drive * excW[i];
          const pa1 = a1[i], pa2 = a2[i];
          const sy1L = y1L[i], sy2L = y2L[i], sy1R = y1R[i], sy2R = y2R[i];
          // Dephasing = signal-following grain: additive noise scaled by |y1| so it
          // roughens a ringing node but leaves its pole (pitch) untouched.
          const aL = sy1L < 0 ? -sy1L : sy1L, aR = sy1R < 0 ? -sy1R : sy1R;
          let y0L = pa1 * sy1L + pa2 * sy2L + inj + dephase * nL * aL;
          let y0R = pa1 * sy1R + pa2 * sy2R + inj + dephase * nR * aR;
          if (y0L > 4) y0L = 4; else if (y0L < -4) y0L = -4;
          if (y0R > 4) y0R = 4; else if (y0R < -4) y0R = -4;
          y2L[i] = sy1L; y1L[i] = y0L;
          y2R[i] = sy1R; y1R[i] = y0R;
          vL += y0L; vR += y0R;
          nodeAccum[i] += y0L * y0L; // aggregate energy across voices (viz)
        }

        // --- per-voice low-pass (TPT SVF) — skipped entirely when neutral so the
        //     default path is bit-identical and free. With an active filter env the
        //     cutoff is env-driven, so the coefficients are recomputed each sample
        //     (a smooth, zipper-free sweep); otherwise they are the block-fixed
        //     static coefficients computed in the per-block pass above.
        if (filterActive) {
          if (filterEnvActive) {
            let cn = filterFreqBase + filterEnvAmt * v.fLevel;
            if (cn < 0) cn = 0; else if (cn > 1) cn = 1;
            let fc = FILTER_MIN_HZ * Math.pow(FILTER_RATIO, cn);
            if (fc > filterNyq) fc = filterNyq;
            const g = Math.tan(Math.PI * fc / sampleRate);
            const a1f = 1 / (1 + g * (g + svfK));
            v.fA1 = a1f; v.fA2 = g * a1f; v.fA3 = g * (g * a1f);
          }
          const fa1 = v.fA1, fa2 = v.fA2, fa3 = v.fA3;
          let i1 = v.fIc1L, i2 = v.fIc2L;
          let f3 = vL - i2;
          let f1 = fa1 * i1 + fa2 * f3;
          let f2 = i2 + fa2 * i1 + fa3 * f3;
          v.fIc1L = 2 * f1 - i1; v.fIc2L = 2 * f2 - i2;
          vL = f2;
          i1 = v.fIc1R; i2 = v.fIc2R;
          f3 = vR - i2;
          f1 = fa1 * i1 + fa2 * f3;
          f2 = i2 + fa2 * i1 + fa3 * f3;
          v.fIc1R = 2 * f1 - i1; v.fIc2R = 2 * f2 - i2;
          vR = f2;
        }
        // --- sub-oscillator — a clean octave-below sine for body, post-filter so
        //     it stays full. Gated on level, so it's free (and silent) by default.
        if (subLevel > 0) {
          let sp = v.subPhase + v.subInc; if (sp >= 1) sp -= 1; v.subPhase = sp;
          const sub = Math.sin(TWO_PI * sp) * subLevel * SUB_GAIN;
          vL += sub; vR += sub;
        }

        const lvl = v.level;
        // pan is (1,1) for the centre / non-unison voice → x·1 is bit-exact.
        mixL += vL * lvl * v.panL; mixR += vR * lvl * v.panR;
        v.rmsAccum += vL * vL + vR * vR;
      }

      // --- master: normalise → DC block → gentle soft-clip → makeup → gain ---
      const xL = mixL * norm;
      const dyL = xL - this.dcXL + 0.995 * this.dcYL;
      this.dcXL = xL; this.dcYL = dyL;
      const xR = mixR * norm;
      const dyR = xR - this.dcXR + 0.995 * this.dcYR;
      this.dcXR = xR; this.dcYR = dyR;
      outL[s] = Math.tanh(dyL * MASTER_DRIVE) * MASTER_MAKEUP * gain;
      outR[s] = Math.tanh(dyR * MASTER_DRIVE) * MASTER_MAKEUP * gain;
    }

    this.rngL = rngL | 0; this.rngR = rngR | 0;

    // --- periodic visualiser report + struck-voice reclaim (~47 fps) ---
    this.reportCounter += n;
    if (this.reportCounter >= 1024) {
      const inv = 1 / this.reportCounter;
      let total = 0;
      for (let i = 0; i < N_NODES; i++) {
        const e = Math.sqrt(nodeAccum[i] * inv);
        this.report[i] = e; total += e; nodeAccum[i] = 0;
      }
      this.report[N_NODES] = total;
      for (let vi = 0; vi < MAX_VOICES; vi++) {
        const v = this.voices[vi];
        if (!v.active) continue;
        const vr = Math.sqrt(v.rmsAccum * inv);
        v.rmsAccum = 0;
        // Reclaim a struck voice that has rung out (held or not).
        if (!v.sustained && v.excRemain <= 0 && v.stage >= DECAY && vr < RECLAIM_RMS) {
          v.active = false;
        }
      }
      this.reportCounter = 0;
      this.port.postMessage({ type: 'energies', e: this.report, voices: this.activeCount() });
    }

    return true;
  }
}

registerProcessor('exciton-engine', ExcitonEngine);
