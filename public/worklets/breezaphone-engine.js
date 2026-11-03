// Breezaphone engine — the Ephemera family's first AEROPHONE: a breath-driven,
// morphable woodwind/brass LEAD.
//
// Physics metaphor: blow into a tube. The air column rings at the note. Change
// how you excite it — an edge, a reed, your lips — and one breath becomes a
// flute, a clarinet/sax, or a brass horn. The voice is a digital-waveguide air
// column (a delay line closed through a lossy, sign-inverting reflection — the
// McIntyre–Schumacher–Woodhouse / STK clarinet loop) driven by a morphable
// nonlinear excitation. Unlike the basses (struck Mantle, self-oscillating
// Avalanche), Breezaphone's energy is BREATH: with breath off the lossy bore
// decays to silence; with breath on the nonlinear valve sustains a tuned tone.
//
// SYNTHESIS (mirrors src/lib/breezaphone/{waveguide,excitation}.ts — the tests
// import the lib as truth; this integrates the identical math inline):
//   • BORE (the resonator = pitch). A single bidirectional delay line, fractional
//     length (linear interpolation), closed through a one-pole loss filter
//     (brightness) and a sign-inverting reflection (gain < 1, so the passive loop
//     decays). f0 = sr/(2·D_total). THE TUNING FIX: D = sr/(2·fSound) minus the
//     loss filter's analytic group delay (so brightness never detunes) minus the
//     excitation reactance measured once into a table in the constructor
//     (buildExcitationCompTable — the exact analogue of Avalanche's R(μ) table).
//   • EXCITATION (the character). ONE injection structure — injected = breath +
//     ΔP·reflCoef(ΔP) — whose reflection-coefficient table MORPHS with EXCITE:
//     jet (gentle, breathy) @0 → reed (clarinet/sax squawk) @0.5 → lip (bright
//     brass) @1. The table is bounded ([-1,1]) so the valve can never inject ∞.
//   • REGISTER / OVERBLOW. Past a breath×register threshold the bore retunes to
//     the octave (mode 2) via the same tuning machinery → the overblown note is
//     guaranteed in tune. Glided through the portamento so it breaks smoothly.
//   • BREATH NOISE (seeded). Air hiss + an onset "chiff", from a per-voice
//     xorshift PRNG (NO Math.random) so renders are bit-reproducible (golden).
//   • NO SUB (this is a lead, not a bass). Drive→Tone→Limiter are downstream
//     (BreezaphoneMasterChain), where the brass bite + glue live.
//
// VOICE MODEL: mono / legato first (a wind lead is monophonic), `glide`
// portamento (the bore length glides), poly available. Output is MONO (L==R).
// RT-safe: voice pool + per-voice delay buffers up front; process() allocates
// nothing, and traps non-finite/blown-up bore state (a runaway nonlinear loop
// would silence the studio bus — it's reset to a clean empty bore).

const BZ_MAX_VOICES = 6; // lead is mono-first; a small pool is plenty

// --- Bore constants (mirror src/lib/breezaphone/waveguide.ts) ----------------
const BZ_REFL_GAIN = 0.99;     // broadband loss < 1 → passive loop decays (breath-gated)
const BZ_LOSS_A_MIN = 0.16;    // brightness → loss-filter one-pole coefficient
const BZ_LOSS_A_MAX = 0.9;
const BZ_MAX_DELAY = 2048;     // delay-line buffer (covers ~50 Hz)
const BZ_MIN_DELAY = 4;
const BZ_OVERBLOW_THRESHOLD = 0.5;
const BZ_STATE_CEIL = 8;       // |bore| blow-up guard (clean cycle ≈ 0.4)

// --- Calibration (mirror waveguide.ts) — 2-D comp over (EXCITE × breath) ---
const BZ_CAL_F0 = 220;
const BZ_CAL_EXCITE_POINTS = 5;
const BZ_CAL_BREATH_POINTS = 4;
const BZ_CAL_BREATH_MIN = 0.35;
const BZ_CAL_BREATH_STEP = 0.25;

// --- Excitation constants (mirror src/lib/breezaphone/excitation.ts) ---------
const BZ_JET_OFFSET = 0.62, BZ_JET_SLOPE = -0.42, BZ_JET_CLAMP = 0.88;
const BZ_REED_OFFSET = 0.7, BZ_REED_SLOPE = -0.44;
const BZ_LIP_OFFSET = 0.62, BZ_LIP_SLOPE = -0.55;
const BZ_BREATH_THRESHOLD = 0.06;
const BZ_DRIVE_FLOOR = 0.36;
const BZ_DRIVE_MAX = 0.5;

// --- Output + master safety (mirror Avalanche's master backstop) -------------
const BZ_OUTPUT_SCALE = 1.35;  // bore lp ≈ ±0.4 → a healthy pre-master level
const SAFETY_DRIVE = 0.8;
const SAFETY_MAKEUP = 1.25;

// --- Air / chiff noise levels ---
const BZ_AIR_LEVEL = 0.16;     // steady breath hiss at air=1
const BZ_CHIFF_LEVEL = 0.4;    // onset chiff burst at note-on
const BZ_CHIFF_MS = 28;        // chiff decay time
const BZ_GROWL_FLUTTER_HZ = 7; // flutter-tongue rate at growl=1
const BZ_VIB_MAX_CENTS = 50;   // vibrato depth at vibDepth=1

// --- bore standing-wave scope probe (viz only; never touches the audio path) -
const BZ_SCOPE_LEN = 128;

const IDLE = 0, ATTACK = 1, DECAY = 2, SUSTAIN = 3, RELEASE = 4;
const VM_POLY = 0, VM_MONO = 1, VM_LEGATO = 2;
const VM_CODES = { poly: VM_POLY, mono: VM_MONO, legato: VM_LEGATO };
const LEGACY_ID = -1;
const TWO_PI = 2 * Math.PI;

function bzClamp(x, lo, hi) {
  return x < lo ? lo : x > hi ? hi : x;
}
function bzClamp01(x) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

// ── Canonical excitation (mirror excitation.ts) ──────────────────────────────
function bzExcitationCoef(d, excite) {
  const wJet = excite < 0.5 ? 1 - excite / 0.5 : 0;
  const wLip = excite > 0.5 ? (excite - 0.5) / 0.5 : 0;
  const wReed = 1 - wJet - wLip;
  const jt = bzClamp(BZ_JET_OFFSET + BZ_JET_SLOPE * d, -BZ_JET_CLAMP, BZ_JET_CLAMP);
  const rt = bzClamp(BZ_REED_OFFSET + BZ_REED_SLOPE * d, -1, 1);
  const lt = bzClamp(BZ_LIP_OFFSET + BZ_LIP_SLOPE * d, -1, 1);
  return wJet * jt + wReed * rt + wLip * lt;
}
/** injected = drive + ΔP·reflCoef(ΔP), ΔP = reflected − drive. Bounded. */
function bzInjected(drive, reflected, excite) {
  const d = reflected - drive;
  return drive + d * bzExcitationCoef(d, excite);
}
/** Raw breath input → bore DRIVE pressure (floored into the robust range so the
 *  note speaks in tune immediately). Exactly 0 below the threshold. */
function bzBreathToDrive(b) {
  if (b <= BZ_BREATH_THRESHOLD) return 0;
  const x = (b - BZ_BREATH_THRESHOLD) / (1 - BZ_BREATH_THRESHOLD);
  const shaped = 1 - Math.exp(-2.5 * x);
  return BZ_DRIVE_FLOOR + (BZ_DRIVE_MAX - BZ_DRIVE_FLOOR) * shaped;
}
/** Raw breath input → output AMPLITUDE (the dynamics; drive stays robust). */
function bzBreathToAmp(b) {
  if (b <= BZ_BREATH_THRESHOLD) return 0;
  const x = (b - BZ_BREATH_THRESHOLD) / (1 - BZ_BREATH_THRESHOLD);
  const xc = x > 1.3 ? 1.3 : x;
  return Math.pow(xc, 1.25);
}

// ── Canonical bore helpers (mirror waveguide.ts) ─────────────────────────────
function bzBrightnessToLossA(b) {
  return BZ_LOSS_A_MIN + (BZ_LOSS_A_MAX - BZ_LOSS_A_MIN) * bzClamp01(b);
}
function bzLossGroupDelay(a) {
  const aa = a < 1e-3 ? 1e-3 : a > 0.999 ? 0.999 : a;
  return (1 - aa) / aa;
}

class BreezaphoneVoice {
  constructor() {
    this.active = false;
    this.held = false;
    this.pedalHeld = false;
    this.noteId = 0;
    this.f0 = 220;
    this.curLnF0 = Math.log(220); // glide position in log-Hz (sounding target)
    this.vel = 1;
    this.velGain = 1;

    this.stage = IDLE;
    this.level = 0;
    this.attackInc = 1;
    this.decayCoef = 0;
    this.sustainLevel = 1;
    this.releaseCoef = 0;

    // Bore: a fractional delay line + one-pole loss memory.
    this.buf = new Float64Array(BZ_MAX_DELAY);
    this.w = 0;
    this.lp = 0;

    // Seeded breath/chiff noise + the onset chiff envelope.
    this.noiseState = 0x1a2b3c4d;
    this.chiff = 0;

    this.effF0 = 220;
    this.rmsAccum = 0;
  }

  clearState() {
    this.buf.fill(0);
    this.w = 0;
    this.lp = 0;
    this.chiff = 0;
    this.level = 0;
    this.rmsAccum = 0;
  }
}

class BreezaphoneEngine extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      // Breath: the player's energy input (CC2 / MPE pressure / the ribbon). The
      // default is a playable level so a bare note-on sounds without a controller.
      { name: 'breath',     defaultValue: 0.8, minValue: 0, maxValue: 1.4, automationRate: 'k-rate' },
      // EXCITE: jet (0) → reed (0.5) → lip (1). The signature character macro.
      { name: 'excite',     defaultValue: 0.4, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      // Register: overblow bias (× breath past a threshold → the octave).
      { name: 'register',   defaultValue: 0,   minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      // Bore length trim, in cents (fine tuning of the air column).
      { name: 'bore',       defaultValue: 0,   minValue: -100, maxValue: 100, automationRate: 'k-rate' },
      // Brightness: the bell/radiation (loss-filter cutoff).
      { name: 'brightness', defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      // Air: steady breath-noise mix (the airiness).
      { name: 'air',        defaultValue: 0.25, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      // Growl: flutter-tongue / multiphonic edge (drive flutter + noise).
      { name: 'growl',      defaultValue: 0,   minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      // Vibrato rate (Hz) + depth (0..1 → ±cents).
      { name: 'vibRate',    defaultValue: 5,   minValue: 0.1, maxValue: 12, automationRate: 'k-rate' },
      { name: 'vibDepth',   defaultValue: 0,   minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      // Master gain.
      { name: 'gain',       defaultValue: 0.7, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      // Portamento time (s). The bore length glides between notes.
      { name: 'glide',      defaultValue: 0.04, minValue: 0, maxValue: 2, automationRate: 'k-rate' },
      // Velocity → output level sensitivity.
      { name: 'velSense',   defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      // Global pitch-bend (semitones) — transient MIDI gesture.
      { name: 'bend',       defaultValue: 0,   minValue: -12, maxValue: 12, automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();
    this.voices = [];
    for (let i = 0; i < BZ_MAX_VOICES; i++) this.voices.push(new BreezaphoneVoice());

    this.lastF0 = 0;
    this.sustainPedal = false;
    this.voiceMode = VM_MONO;
    this.monoStack = [];
    this.monoStackLen = 0;
    this.monoVoice = null;
    this.monoCurId = -1;

    // Global LFOs (vibrato + flutter-tongue), advanced per sample.
    this.vibPhase = 0;
    this.flutterPhase = 0;

    // Master DC blocker (the reed injects a DC pressure offset).
    this.dcX = 0; this.dcY = 0;
    this.reportCounter = 0;

    // Bore standing-wave scope (viz only; read-only on the audio path).
    this.scopeSnap = new Float32Array(BZ_SCOPE_LEN);
    this.scopePrimary = -1;

    // Build the excitation-reactance tuning table (mirror buildExcitationCompTable).
    this.calBuf = new Float64Array(BZ_MAX_DELAY); // scratch for calibration only
    this.compTable = this.buildExcitationCompTable();

    this.port.onmessage = (ev) => this.handleMessage(ev.data);
  }

  // --- tuning calibration (mirror waveguide.ts) ------------------------------
  /** Measure the loop period (samples) at a fixed delay via de-trended upward
   *  zero-crossings (median inter-crossing interval). Uses calBuf (constructor
   *  only — never called from process()). */
  measureLoopPeriodSamples(D, drive, excite, lossA) {
    const buf = this.calBuf;
    buf.fill(0);
    let w = 0, lp = 0;
    const warmup = 8000, windowN = 8000;
    for (let i = 0; i < warmup; i++) {
      const di = Math.floor(D), fd = D - di;
      let i0 = w - di; i0 = ((i0 % BZ_MAX_DELAY) + BZ_MAX_DELAY) % BZ_MAX_DELAY;
      let i1 = i0 - 1; if (i1 < 0) i1 += BZ_MAX_DELAY;
      const raw = buf[i0] * (1 - fd) + buf[i1] * fd;
      lp += lossA * (raw - lp);
      const reflected = -BZ_REFL_GAIN * lp;
      buf[w] = bzInjected(drive, reflected, excite);
      w = w + 1 === BZ_MAX_DELAY ? 0 : w + 1;
    }
    const win = new Float64Array(windowN);
    let mean = 0;
    for (let i = 0; i < windowN; i++) {
      const di = Math.floor(D), fd = D - di;
      let i0 = w - di; i0 = ((i0 % BZ_MAX_DELAY) + BZ_MAX_DELAY) % BZ_MAX_DELAY;
      let i1 = i0 - 1; if (i1 < 0) i1 += BZ_MAX_DELAY;
      const raw = buf[i0] * (1 - fd) + buf[i1] * fd;
      lp += lossA * (raw - lp);
      const reflected = -BZ_REFL_GAIN * lp;
      buf[w] = bzInjected(drive, reflected, excite);
      w = w + 1 === BZ_MAX_DELAY ? 0 : w + 1;
      win[i] = lp; mean += lp;
    }
    mean /= windowN;
    const crossings = [];
    let prev = win[0] - mean;
    for (let i = 1; i < windowN; i++) {
      const cur = win[i] - mean;
      if (prev < 0 && cur >= 0) {
        const frac = prev !== cur ? -prev / (cur - prev) : 0;
        crossings.push(i - 1 + frac);
      }
      prev = cur;
    }
    if (crossings.length < 8) return 0;
    const gaps = [];
    for (let i = 1; i < crossings.length; i++) gaps.push(crossings[i] - crossings[i - 1]);
    gaps.sort((a, b) => a - b);
    return gaps[gaps.length >> 1];
  }

  calibrateExcitationComp(excite, breathInput) {
    const sr = sampleRate;
    const lossA = bzBrightnessToLossA(0.5);
    const lossGD = bzLossGroupDelay(lossA);
    const D = sr / (2 * BZ_CAL_F0) - lossGD;
    const period = this.measureLoopPeriodSamples(D, bzBreathToDrive(breathInput), excite, lossA);
    if (period <= 0) return 0;
    const reactance = (period - sr / BZ_CAL_F0) / 2;
    return reactance < -8 ? -8 : reactance > 8 ? 8 : reactance;
  }

  buildExcitationCompTable() {
    const EP = BZ_CAL_EXCITE_POINTS, BP = BZ_CAL_BREATH_POINTS;
    const r = new Float64Array(EP * BP);
    for (let ei = 0; ei < EP; ei++) {
      const excite = ei / (EP - 1);
      for (let bi = 0; bi < BP; bi++) {
        r[ei * BP + bi] = this.calibrateExcitationComp(excite, BZ_CAL_BREATH_MIN + BZ_CAL_BREATH_STEP * bi);
      }
    }
    return r;
  }

  /** Bilinear (EXCITE × breath) reactance lookup. */
  excitationComp(excite, breathInput) {
    const r = this.compTable;
    const EP = BZ_CAL_EXCITE_POINTS, BP = BZ_CAL_BREATH_POINTS;
    const ePos = bzClamp01(excite) * (EP - 1);
    let ei = Math.floor(ePos); if (ei > EP - 2) ei = EP - 2;
    const ef = ePos - ei;
    const bMax = BZ_CAL_BREATH_MIN + BZ_CAL_BREATH_STEP * (BP - 1);
    const bClamped = breathInput < BZ_CAL_BREATH_MIN ? BZ_CAL_BREATH_MIN : breathInput > bMax ? bMax : breathInput;
    const bPos = (bClamped - BZ_CAL_BREATH_MIN) / BZ_CAL_BREATH_STEP;
    let bi = Math.floor(bPos); if (bi > BP - 2) bi = BP - 2;
    const bf = bPos - bi;
    const c00 = r[ei * BP + bi], c01 = r[ei * BP + bi + 1];
    const c10 = r[(ei + 1) * BP + bi], c11 = r[(ei + 1) * BP + bi + 1];
    const top = c00 * (1 - bf) + c01 * bf;
    const bot = c10 * (1 - bf) + c11 * bf;
    return top * (1 - ef) + bot * ef;
  }

  // --- voice management (forked from Avalanche/Mantle) -----------------------
  allocVoice(id) {
    for (let i = 0; i < BZ_MAX_VOICES; i++) {
      const v = this.voices[i];
      if (v.active && v.noteId === id) return v;
    }
    for (let i = 0; i < BZ_MAX_VOICES; i++) if (!this.voices[i].active) return this.voices[i];
    let min = Infinity, pick = this.voices[0];
    for (let i = 0; i < BZ_MAX_VOICES; i++) {
      const v = this.voices[i];
      if (v.level < min) { min = v.level; pick = v; }
    }
    return pick;
  }

  handleMessage(m) {
    switch (m.type) {
      case 'voiceOn':    this.voiceOn(m); break;
      case 'voiceOff':   this.voiceOff(m.id | 0); break;
      case 'setSustain': this.setSustainPedal(!!m.on); break;
      case 'setVoiceMode': this.setVoiceMode(m.mode); break;
      case 'panic':      this.panic(); break;
      case 'noteOn':     this.voiceOn({ id: LEGACY_ID, freq: m.freq, vel: m.vel }); break;
      case 'noteOff':    this.voiceOff(LEGACY_ID); break;
    }
  }

  voiceOn(m) {
    if (this.voiceMode !== VM_POLY) { this.monoNoteOn(m); return; }
    const id = m.id | 0;
    this.initVoice(this.allocVoice(id), id, m, false);
    this.lastF0 = m.freq > 0 ? m.freq : this.lastF0;
  }

  /** Arm one voice. `forceRetrig` re-articulates in place (keeps the running bore
   *  + glide origin) — a click-free mono multi-trigger. */
  initVoice(v, id, m, forceRetrig) {
    const retrig = forceRetrig || (v.active && v.noteId === id);
    if (!retrig) v.clearState();

    v.active = true;
    v.held = true;
    v.pedalHeld = false;
    v.noteId = id;
    if (m.freq > 0) v.f0 = m.freq;
    if (!retrig) {
      const origin = this.lastF0 > 0 ? this.lastF0 : v.f0;
      v.curLnF0 = Math.log(origin);
      v.noiseState = (0x1a2b3c4d ^ Math.imul(id + 1, 0x9e3779b1)) >>> 0;
      if (v.noiseState === 0) v.noiseState = 0x1a2b3c4d;
    }
    v.vel = m.vel != null ? m.vel : 1;

    const sr = sampleRate;
    const a = Math.max(0, m.a != null ? m.a : 8);
    const d = Math.max(0, m.d != null ? m.d : 120);
    const s = Math.min(1, Math.max(0, m.s != null ? m.s : 0.9));
    const r = Math.max(1, m.r != null ? m.r : 200);
    v.attackInc = 1 / Math.max(1, (a * sr) / 1000);
    v.decayCoef = Math.exp(-1 / Math.max(1, (d * sr) / 1000));
    v.sustainLevel = s;
    v.releaseCoef = Math.exp(-1 / Math.max(1, (r * sr) / 1000));
    v.stage = ATTACK;
    v.chiff = 1; // re-chiff on every (re)trigger
  }

  voiceOff(id) {
    if (this.voiceMode !== VM_POLY) { this.monoNoteOff(id); return; }
    for (let i = 0; i < BZ_MAX_VOICES; i++) {
      const v = this.voices[i];
      if (v.active && v.noteId === id && v.held) {
        v.held = false;
        if (this.sustainPedal) v.pedalHeld = true;
        else v.stage = RELEASE;
      }
    }
  }

  setVoiceMode(mode) {
    const code = VM_CODES[mode] != null ? VM_CODES[mode] : VM_POLY;
    if (code === this.voiceMode) return;
    for (let i = 0; i < BZ_MAX_VOICES; i++) {
      const v = this.voices[i];
      if (v.active && v.held) { v.held = false; v.stage = RELEASE; }
    }
    this.monoStackLen = 0; this.monoVoice = null; this.monoCurId = -1;
    this.voiceMode = code;
  }

  monoStackPush(m, id) { this.monoStackRemove(id); this.monoStack[this.monoStackLen++] = m; }
  monoStackRemove(id) {
    let w = 0;
    for (let r = 0; r < this.monoStackLen; r++) {
      const e = this.monoStack[r];
      if ((e.id | 0) !== id) this.monoStack[w++] = e;
    }
    this.monoStackLen = w;
  }

  /** Retarget the mono voice WITHOUT re-articulating — the legato glide (bore +
   *  breath run on uninterrupted). */
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
      this.monoRetarget(v, m, id);
    } else {
      const reuse = !!(v && v.active);
      if (!reuse) v = this.allocVoice(id);
      this.initVoice(v, id, m, reuse);
      this.monoVoice = v;
    }
    this.monoVoice = v;
    this.monoCurId = id;
    this.lastF0 = m.freq > 0 ? m.freq : this.lastF0;
  }

  monoNoteOff(id) {
    this.monoStackRemove(id);
    if (id !== this.monoCurId) return;
    const v = this.monoVoice;
    if (!v) return;
    if (this.monoStackLen > 0) {
      const top = this.monoStack[this.monoStackLen - 1];
      const topId = top.id | 0;
      if (this.voiceMode === VM_LEGATO) this.monoRetarget(v, top, topId);
      else this.initVoice(v, topId, top, true);
      this.monoCurId = topId;
      this.lastF0 = top.freq > 0 ? top.freq : this.lastF0;
    } else {
      v.held = false;
      if (this.sustainPedal) v.pedalHeld = true;
      else v.stage = RELEASE;
      this.monoCurId = -1;
    }
  }

  setSustainPedal(on) {
    this.sustainPedal = on;
    if (!on) {
      for (let i = 0; i < BZ_MAX_VOICES; i++) {
        const v = this.voices[i];
        if (v.pedalHeld) { v.pedalHeld = false; v.stage = RELEASE; }
      }
    }
  }

  panic() {
    for (let i = 0; i < BZ_MAX_VOICES; i++) {
      const v = this.voices[i];
      v.active = false; v.held = false; v.pedalHeld = false;
      v.stage = IDLE; v.clearState();
    }
    this.monoStackLen = 0; this.monoVoice = null; this.monoCurId = -1;
    this.dcX = 0; this.dcY = 0;
  }

  activeCount() {
    let c = 0;
    for (let i = 0; i < BZ_MAX_VOICES; i++) if (this.voices[i].active) c++;
    return c;
  }

  process(_inputs, outputs, parameters) {
    const out = outputs[0];
    if (!out || out.length === 0) return true;
    const outL = out[0];
    const outR = out.length > 1 ? out[1] : out[0];
    const n = outL.length;
    const sr = sampleRate;

    const breath = parameters.breath ? parameters.breath[0] : 0.8;
    const excite = parameters.excite ? parameters.excite[0] : 0.4;
    const register = parameters.register ? parameters.register[0] : 0;
    const boreTrimCents = parameters.bore ? parameters.bore[0] : 0;
    const brightness = parameters.brightness ? parameters.brightness[0] : 0.5;
    const air = parameters.air ? parameters.air[0] : 0.25;
    const growl = parameters.growl ? parameters.growl[0] : 0;
    const vibRate = parameters.vibRate ? parameters.vibRate[0] : 5;
    const vibDepth = parameters.vibDepth ? parameters.vibDepth[0] : 0;
    const gain = parameters.gain ? parameters.gain[0] : 0.7;
    const glideTime = parameters.glide ? parameters.glide[0] : 0.04;
    const velSense = parameters.velSense ? parameters.velSense[0] : 0.5;
    const bendMul = Math.pow(2, (parameters.bend ? parameters.bend[0] : 0) / 12);

    // --- k-rate shared coefficients ---
    const drive = bzBreathToDrive(breath);
    const breathAmp = bzBreathToAmp(breath); // perceived loudness + noise scale (dynamics)
    const breathNorm = bzClamp01(breath);
    const lossA = bzBrightnessToLossA(brightness);
    const lossGD = bzLossGroupDelay(lossA);
    const comp = this.excitationComp(excite, breath);
    const boreTrimMul = Math.pow(2, boreTrimCents / 1200);
    const overblow = register * breathNorm > BZ_OVERBLOW_THRESHOLD;
    const octaveMul = overblow ? 2 : 1;
    const glideCoef = glideTime > 0.0005 ? Math.exp(-(n / sr) / glideTime) : 0;
    const vibInc = (TWO_PI * vibRate) / sr;
    const flutterInc = (TWO_PI * BZ_GROWL_FLUTTER_HZ) / sr;
    const chiffCoef = Math.exp(-1 / Math.max(1, (BZ_CHIFF_MS * sr) / 1000));
    const airActive = air > 1e-4 || growl > 1e-4;

    // --- per-voice per-block glide toward the (possibly overblown) target ---
    for (let vi = 0; vi < BZ_MAX_VOICES; vi++) {
      const v = this.voices[vi];
      if (!v.active) continue;
      const lnTarget = Math.log(v.f0 * octaveMul);
      v.curLnF0 = lnTarget + (v.curLnF0 - lnTarget) * glideCoef;
      v.velGain = 1 + velSense * ((0.4 + 0.6 * v.vel) - 1);
    }

    // Pick the loudest voice for the standing-wave scope.
    let scopePrimary = -1, scopePmax = -1;
    for (let vi = 0; vi < BZ_MAX_VOICES; vi++) {
      const v = this.voices[vi];
      if (v.active && v.level > scopePmax) { scopePmax = v.level; scopePrimary = vi; }
    }
    this.scopePrimary = scopePrimary;

    for (let s = 0; s < n; s++) {
      // Global LFO phases (vibrato + flutter), advanced once per sample.
      this.vibPhase += vibInc; if (this.vibPhase >= TWO_PI) this.vibPhase -= TWO_PI;
      this.flutterPhase += flutterInc; if (this.flutterPhase >= TWO_PI) this.flutterPhase -= TWO_PI;
      const vibMul = vibDepth > 1e-4
        ? Math.pow(2, (vibDepth * BZ_VIB_MAX_CENTS * Math.sin(this.vibPhase)) / 1200)
        : 1;
      const flutter = growl > 1e-4 ? 1 + growl * 0.6 * Math.sin(this.flutterPhase) : 1;
      const voiceDrive = drive * flutter;

      let mix = 0;
      for (let vi = 0; vi < BZ_MAX_VOICES; vi++) {
        const v = this.voices[vi];
        if (!v.active) continue;

        // --- amp envelope (forked from Avalanche/Mantle) ---
        switch (v.stage) {
          case ATTACK:
            v.level += v.attackInc;
            if (v.level >= 1) { v.level = 1; v.stage = DECAY; }
            break;
          case DECAY:
            v.level = v.sustainLevel + (v.level - v.sustainLevel) * v.decayCoef;
            if (v.level <= v.sustainLevel + 1e-4) { v.level = v.sustainLevel; v.stage = SUSTAIN; }
            break;
          case SUSTAIN: break;
          case RELEASE:
            v.level *= v.releaseCoef;
            if (v.level < 1e-4) { v.active = false; }
            break;
        }
        if (!v.active) continue;

        // --- pitch → fractional bore delay D (mirror boreDelaySamples) ---
        const effF0 = Math.exp(v.curLnF0) * bendMul * boreTrimMul * vibMul;
        v.effF0 = effF0;
        let D = sr / (2 * effF0) - lossGD - comp;
        if (D < BZ_MIN_DELAY) D = BZ_MIN_DELAY;
        else if (D > BZ_MAX_DELAY - 2) D = BZ_MAX_DELAY - 2;

        // --- one bore loop step (mirror boreLoopStep) ---
        const di = D | 0, fd = D - di;
        let i0 = v.w - di; i0 = ((i0 % BZ_MAX_DELAY) + BZ_MAX_DELAY) % BZ_MAX_DELAY;
        let i1 = i0 - 1; if (i1 < 0) i1 += BZ_MAX_DELAY;
        const raw = v.buf[i0] * (1 - fd) + v.buf[i1] * fd;
        v.lp += lossA * (raw - v.lp);
        const reflected = -BZ_REFL_GAIN * v.lp;
        const injected = bzInjected(voiceDrive, reflected, excite);
        v.buf[v.w] = injected;
        v.w = v.w + 1 === BZ_MAX_DELAY ? 0 : v.w + 1;

        // RT-safety: a runaway/NaN bore → reset to a clean empty bore (silences
        // nothing downstream, never NaNs the studio bus).
        let boreOut = v.lp;
        if (!Number.isFinite(boreOut) || boreOut > BZ_STATE_CEIL || boreOut < -BZ_STATE_CEIL) {
          v.buf.fill(0); v.w = 0; v.lp = 0; boreOut = 0;
        }

        // --- seeded air hiss + onset chiff (breath-gated via breathAmp) ---
        let airN = 0;
        if (airActive && breathAmp > 1e-5) {
          let ns = v.noiseState;
          ns ^= ns << 13; ns ^= ns >>> 17; ns ^= ns << 5; ns >>>= 0;
          v.noiseState = ns;
          const white = (ns / 0xffffffff) * 2 - 1;
          const lvl = (air * BZ_AIR_LEVEL + v.chiff * BZ_CHIFF_LEVEL) * breathAmp;
          airN = white * lvl;
        }
        if (v.chiff > 1e-5) v.chiff *= chiffCoef;

        const voiceOut = (boreOut * BZ_OUTPUT_SCALE + airN) * v.level * v.velGain * breathAmp;
        mix += voiceOut;
        v.rmsAccum += voiceOut * voiceOut;
      }

      // --- master: DC block → safety clip → gain → mono out (reused) ---
      const dy = mix - this.dcX + 0.9994 * this.dcY;
      this.dcX = mix; this.dcY = dy;
      let o = Math.tanh(dy * gain * SAFETY_DRIVE) * SAFETY_MAKEUP;
      if (!Number.isFinite(o)) o = 0;
      outL[s] = o;
      if (outR !== outL) outR[s] = o;
    }

    // --- periodic viz report (~47 fps) ---
    this.reportCounter += n;
    if (this.reportCounter >= 1024) {
      const inv = 1 / this.reportCounter;
      let total = 0;
      for (let vi = 0; vi < BZ_MAX_VOICES; vi++) {
        const v = this.voices[vi];
        if (!v.active) continue;
        total += Math.sqrt(v.rmsAccum * inv);
        v.rmsAccum = 0;
      }
      this.reportCounter = 0;
      // Snapshot the dominant voice's bore (the standing wave |p(x)| along the
      // tube) into the reusable buffer for BreezaphoneBoreScope (Phase 2). Posted
      // WITHOUT transfer (structured-clone copies it) → the buffer is reused.
      const snap = this.scopeSnap;
      const pv = this.scopePrimary;
      if (pv >= 0) {
        const v = this.voices[pv];
        const span = Math.min(BZ_MAX_DELAY, Math.max(BZ_SCOPE_LEN, Math.round(sr / (2 * (v.effF0 || 220)))));
        for (let i = 0; i < BZ_SCOPE_LEN; i++) {
          const idx = ((v.w - 1 - Math.round((span * i) / BZ_SCOPE_LEN)) % BZ_MAX_DELAY + BZ_MAX_DELAY) % BZ_MAX_DELAY;
          snap[i] = v.buf[idx];
        }
      } else {
        snap.fill(0);
      }
      this.port.postMessage({ type: 'energies', rms: total, voices: this.activeCount(), scope: snap });
    }

    return true;
  }
}

registerProcessor('breezaphone-engine', BreezaphoneEngine);
