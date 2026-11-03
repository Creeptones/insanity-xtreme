// INSANITY XTREME PRO MAX ULTRA DELUXE (It Actually Works Edition) — parameter table.
//
// The single source of truth for every parameter: id, range, default and index.
// The page, the worklet (bundled via the "@/..." alias) and the presets all read
// this table. A parameter's INDEX is its position in PARAMS and is what goes
// over the wire (see protocol.ts). Never reorder at runtime.
//
// Pure TS with no DOM or React imports, so the AudioWorklet bundle can import it.

export type ParamKind = "cont" | "int" | "enum" | "bool";
export type ParamSkew = "lin" | "log";
/** Where the value is consumed. "engine" values are sent to the worklet. */
export type ParamTarget = "engine" | "layer";

export type ParamGroup =
  | "osc"
  | "voice"
  | "bank"
  | "fx"
  | "lfo"
  | "env"
  | "func"
  | "macro"
  | "xy"
  | "mod"
  | "chaos"
  | "master"
  | "global"
  | "layer";

export interface ParamSpec {
  id: string;
  label: string;
  group: ParamGroup;
  kind: ParamKind;
  min: number;
  max: number;
  def: number;
  skew: ParamSkew;
  unit?: string;
  options?: readonly string[];
  target: ParamTarget;
  /** True when the mod matrix may target it (continuous engine params only). */
  modulatable: boolean;
}

// ---- counts --------------------------------------------------------------
export const OSC_COUNT = 8;
export const BANK_BANDS = 32;
export const LFO_COUNT = 16;
export const ENV_COUNT = 16;
export const FUNC_COUNT = 16;
export const MACRO_COUNT = 64;
export const XY_COUNT = 16;
export const MOD_SLOTS = 64;
export const MAX_VOICES = 16;

// ---- enum option lists ---------------------------------------------------
export const OSC_MODES = [
  "off", "sine", "tri", "saw", "square", "noise", "wavetable", "fm", "additive", "chaos",
] as const;
export const FILTER_TYPES = ["lp", "hp", "bp", "notch"] as const;
export const BANK_TYPES = ["peak", "lp", "hp", "bp", "notch"] as const;
export const LFO_SHAPES = ["sine", "tri", "saw", "square", "random"] as const;
export const FUNC_MODES = ["random", "sampleHold", "drift", "step"] as const;
export const VOICE_FILTER_ROUTING = ["serial", "parallel"] as const;
export const LAYER_IDS = ["braids", "breezaphone", "pollen", "exciton"] as const;
export type LayerId = (typeof LAYER_IDS)[number];

// ---- builder -------------------------------------------------------------
const list: ParamSpec[] = [];

function cont(
  id: string, label: string, group: ParamGroup, min: number, max: number, def: number,
  opts: { skew?: ParamSkew; unit?: string; target?: ParamTarget; modulatable?: boolean } = {},
): void {
  const target = opts.target ?? "engine";
  list.push({
    id, label, group, kind: "cont", min, max, def, skew: opts.skew ?? "lin", unit: opts.unit,
    target, modulatable: opts.modulatable ?? target === "engine",
  });
}
function int(id: string, label: string, group: ParamGroup, min: number, max: number, def: number, target: ParamTarget = "engine"): void {
  list.push({ id, label, group, kind: "int", min, max, def, skew: "lin", target, modulatable: false });
}
function en(id: string, label: string, group: ParamGroup, options: readonly string[], def: number, target: ParamTarget = "engine"): void {
  list.push({ id, label, group, kind: "enum", min: 0, max: options.length - 1, def, skew: "lin", options, target, modulatable: false });
}
function bool(id: string, label: string, group: ParamGroup, def: boolean, target: ParamTarget = "engine"): void {
  list.push({ id, label, group, kind: "bool", min: 0, max: 1, def: def ? 1 : 0, skew: "lin", target, modulatable: false });
}

// ---- oscillators: "GLOBAL EVERYTHING" ------------------------------------
// shape: pulse width (square), table position (wavetable), FM index (fm),
// spectral tilt (additive), chaos mu (chaos), colour (noise).
// ratio: FM modulator ratio; for additive, partial stretch.
for (let i = 1; i <= OSC_COUNT; i++) {
  const p = `osc${i}`;
  en(`${p}.mode`, `OSC ${i} Mode`, "osc", OSC_MODES, i === 1 ? 3 : i === 2 ? 4 : 0);
  cont(`${p}.level`, `OSC ${i} Level`, "osc", 0, 1, i <= 2 ? 0.6 : 0.5);
  cont(`${p}.coarse`, `OSC ${i} Coarse`, "osc", -24, 24, i === 2 ? -12 : 0, { unit: "st" });
  cont(`${p}.fine`, `OSC ${i} Fine`, "osc", -100, 100, i === 2 ? 7 : 0, { unit: "ct" });
  cont(`${p}.pan`, `OSC ${i} Pan`, "osc", -1, 1, 0);
  cont(`${p}.shape`, `OSC ${i} Shape`, "osc", 0, 1, 0.5);
  cont(`${p}.ratio`, `OSC ${i} Ratio`, "osc", 0.25, 16, 2, { skew: "log" });
  int(`${p}.unison`, `OSC ${i} Unison`, "osc", 1, 8, 1);
  cont(`${p}.detune`, `OSC ${i} Detune`, "osc", 0, 1, 0.2);
}

// ---- voice: amp/filter envelopes, 2 voice filters, glide -----------------
cont("amp.attack", "Amp Attack", "voice", 0.001, 10, 0.005, { skew: "log", unit: "s" });
cont("amp.decay", "Amp Decay", "voice", 0.001, 10, 0.3, { skew: "log", unit: "s" });
cont("amp.sustain", "Amp Sustain", "voice", 0, 1, 0.8);
cont("amp.release", "Amp Release", "voice", 0.001, 15, 0.35, { skew: "log", unit: "s" });
cont("fenv.attack", "Filter Env Attack", "voice", 0.001, 10, 0.005, { skew: "log", unit: "s" });
cont("fenv.decay", "Filter Env Decay", "voice", 0.001, 10, 0.4, { skew: "log", unit: "s" });
cont("fenv.sustain", "Filter Env Sustain", "voice", 0, 1, 0.3);
cont("fenv.release", "Filter Env Release", "voice", 0.001, 15, 0.4, { skew: "log", unit: "s" });
for (let f = 1; f <= 2; f++) {
  const p = `vf${f}`;
  en(`${p}.type`, `Filter ${f} Type`, "voice", FILTER_TYPES, f === 1 ? 0 : 1);
  cont(`${p}.cutoff`, `Filter ${f} Cutoff`, "voice", 20, 20000, f === 1 ? 2400 : 20, { skew: "log", unit: "Hz" });
  cont(`${p}.reso`, `Filter ${f} Reso`, "voice", 0, 1, f === 1 ? 0.25 : 0);
  cont(`${p}.drive`, `Filter ${f} Drive`, "voice", 0, 1, 0);
  cont(`${p}.envAmt`, `Filter ${f} Env Amt`, "voice", -1, 1, f === 1 ? 0.35 : 0);
  cont(`${p}.keytrack`, `Filter ${f} Keytrack`, "voice", 0, 1, 0.3);
}
en("vf.routing", "Filter Routing", "voice", VOICE_FILTER_ROUTING, 0);
cont("voice.glide", "Glide", "voice", 0, 2, 0, { unit: "s" });
int("voice.polyphony", "Polyphony", "voice", 1, MAX_VOICES, 12);
cont("voice.bendRange", "Bend Range", "voice", 0, 24, 2, { unit: "st", modulatable: false });

// ---- "FILTERS (32x)": bus filter bank ------------------------------------
// Bands are grouped into 4 rows of 8 ("FILTER ROUTING" grid). `parallel`
// toggles whether a band sits in parallel with the row (1) or in series (0).
const BANK_DEFAULT_FREQS = (i: number): number => 30 * Math.pow(18000 / 30, (i - 1) / (BANK_BANDS - 1));
for (let i = 1; i <= BANK_BANDS; i++) {
  const p = `bank${i}`;
  bool(`${p}.on`, `FLT ${i} On`, "bank", false);
  en(`${p}.type`, `FLT ${i} Type`, "bank", BANK_TYPES, 0);
  cont(`${p}.freq`, `FLT ${i} Freq`, "bank", 20, 20000, Math.round(BANK_DEFAULT_FREQS(i)), { skew: "log", unit: "Hz" });
  cont(`${p}.q`, `FLT ${i} Q`, "bank", 0.1, 18, 1, { skew: "log" });
  cont(`${p}.gain`, `FLT ${i} Gain`, "bank", -18, 18, 0, { unit: "dB" });
  bool(`${p}.parallel`, `FLT ${i} Parallel`, "bank", false);
}
cont("bank.mix", "Filter Bank Mix", "bank", 0, 1, 1);

// ---- "EFFECTS GALAXY" ----------------------------------------------------
cont("fx.drive.db", "Drive", "fx", 0, 24, 0, { unit: "dB" });
cont("fx.drive.mix", "Drive Mix", "fx", 0, 1, 0);
int("fx.crush.bits", "Crush Bits", "fx", 2, 16, 16);
cont("fx.crush.rate", "Crush Downsample", "fx", 1, 32, 1, { skew: "log" });
cont("fx.crush.mix", "Crush Mix", "fx", 0, 1, 0);
cont("fx.chorus.rate", "Chorus Rate", "fx", 0.05, 6, 0.4, { skew: "log", unit: "Hz" });
cont("fx.chorus.depth", "Chorus Depth", "fx", 0, 1, 0.3);
cont("fx.chorus.mix", "Chorus Mix", "fx", 0, 1, 0);
cont("fx.phaser.rate", "Phaser Rate", "fx", 0.05, 8, 0.3, { skew: "log", unit: "Hz" });
cont("fx.phaser.depth", "Phaser Depth", "fx", 0, 1, 0.6);
cont("fx.phaser.mix", "Phaser Mix", "fx", 0, 1, 0);
cont("fx.delay.time", "Delay Time", "fx", 15, 1200, 375, { skew: "log", unit: "ms" });
cont("fx.delay.feedback", "Delay Feedback", "fx", 0, 0.95, 0.35);
cont("fx.delay.damping", "Delay Damping", "fx", 0, 1, 0.4);
cont("fx.delay.mix", "Delay Mix", "fx", 0, 1, 0.15);
cont("fx.reverb.size", "Reverb Size", "fx", 0, 1, 0.6);
cont("fx.reverb.damping", "Reverb Damping", "fx", 0, 1, 0.5);
cont("fx.reverb.mix", "Reverb Mix", "fx", 0, 1, 0.2);
cont("fx.ring.freq", "Ring Mod Freq", "fx", 1, 4000, 220, { skew: "log", unit: "Hz" });
cont("fx.ring.mix", "Ring Mod Mix", "fx", 0, 1, 0);
cont("fx.width", "Stereo Width", "fx", 0, 2, 1);

// ---- "MODULATORS & ENVELOPES (64x)" ---------------------------------------
for (let i = 1; i <= LFO_COUNT; i++) {
  en(`lfo${i}.shape`, `LFO ${i} Shape`, "lfo", LFO_SHAPES, (i - 1) % LFO_SHAPES.length);
  cont(`lfo${i}.rate`, `LFO ${i} Rate`, "lfo", 0.01, 30, 0.5 + i * 0.37, { skew: "log", unit: "Hz" });
  cont(`lfo${i}.amount`, `LFO ${i} Amount`, "lfo", 0, 1, 1);
}
for (let i = 1; i <= ENV_COUNT; i++) {
  cont(`env${i}.attack`, `ENV ${i} Attack`, "env", 0.001, 10, 0.01 * i, { skew: "log", unit: "s" });
  cont(`env${i}.decay`, `ENV ${i} Decay`, "env", 0.001, 10, 0.3, { skew: "log", unit: "s" });
  cont(`env${i}.sustain`, `ENV ${i} Sustain`, "env", 0, 1, 0.5);
  cont(`env${i}.release`, `ENV ${i} Release`, "env", 0.001, 15, 0.5, { skew: "log", unit: "s" });
}
for (let i = 1; i <= FUNC_COUNT; i++) {
  en(`func${i}.mode`, `FUNC ${i} Mode`, "func", FUNC_MODES, (i - 1) % FUNC_MODES.length);
  cont(`func${i}.rate`, `FUNC ${i} Rate`, "func", 0.05, 40, 2, { skew: "log", unit: "Hz" });
  cont(`func${i}.smooth`, `FUNC ${i} Smooth`, "func", 0, 1, 0.3);
}

// ---- "MACRO UNIVERSE (64x)" and "XY PADS (16x)" ----------------------------
// Macros and XY values are mod SOURCES; they are not themselves modulatable.
for (let i = 1; i <= MACRO_COUNT; i++) {
  cont(`macro${i}`, `Macro ${i}`, "macro", 0, 1, 0, { modulatable: false });
}
for (let i = 1; i <= XY_COUNT; i++) {
  cont(`xy${i}.x`, `XY ${i} X`, "xy", 0, 1, 0.5, { modulatable: false });
  cont(`xy${i}.y`, `XY ${i} Y`, "xy", 0, 1, 0.5, { modulatable: false });
}

// ---- "CHAOS ENGINE": Van der Pol (port of bassic-engine.js) -----------------
cont("chaos.mu", "Chaos Mu", "chaos", 0.01, 8, 1.2, { skew: "log" });
cont("chaos.rate", "Chaos Rate", "chaos", 0.05, 40, 1.5, { skew: "log", unit: "Hz" });
cont("chaos.drive", "Chaos Drive", "chaos", 0, 1, 0.3);
cont("chaos.amount", "Chaos Amount", "chaos", 0, 1, 1);

// ---- "MASTER SECTION" -------------------------------------------------------
cont("master.eqLow", "EQ Low", "master", -15, 15, 0, { unit: "dB" });
cont("master.eqMid", "EQ Mid", "master", -15, 15, 0, { unit: "dB" });
cont("master.eqMidFreq", "EQ Mid Freq", "master", 200, 8000, 1200, { skew: "log", unit: "Hz" });
cont("master.eqHigh", "EQ High", "master", -15, 15, 0, { unit: "dB" });
cont("master.compThresh", "Comp Threshold", "master", -48, 0, -12, { unit: "dB" });
cont("master.compRatio", "Comp Ratio", "master", 1, 20, 3, { skew: "log" });
cont("master.compAttack", "Comp Attack", "master", 0.1, 100, 10, { skew: "log", unit: "ms" });
cont("master.compRelease", "Comp Release", "master", 10, 1000, 120, { skew: "log", unit: "ms" });
cont("master.ceiling", "Limiter Ceiling", "master", -12, 0, -0.3, { unit: "dB" });
cont("master.clipper", "Clipper", "master", 0, 1, 0);
cont("master.volume", "Output", "master", -60, 6, 0, { unit: "dB" });

// ---- global -----------------------------------------------------------------
// destroyCpu = the "DESTROY CPU" button: forces 8x unison on every active oscillator.
bool("global.destroyCpu", "DESTROY CPU", "global", false);
cont("global.tempo", "Tempo", "global", 40, 240, 120, { unit: "BPM", modulatable: false });

// ---- layers (existing site instruments loaded as extra AudioNodes) ----------
for (const l of LAYER_IDS) {
  bool(`layer.${l}.on`, `${l} On`, "layer", false, "layer");
  cont(`layer.${l}.level`, `${l} Level`, "layer", 0, 1, 0.6, { target: "layer" });
  cont(`layer.${l}.a`, `${l} A`, "layer", 0, 1, 0.5, { target: "layer" });
  cont(`layer.${l}.b`, `${l} B`, "layer", 0, 1, 0.5, { target: "layer" });
  cont(`layer.${l}.c`, `${l} C`, "layer", 0, 1, 0.5, { target: "layer" });
  cont(`layer.${l}.d`, `${l} D`, "layer", 0, 1, 0.5, { target: "layer" });
}

// ---- "COMPLEX MODULATION ROUTING": 64 mod-matrix slots ------------------------
// Declared LAST so the modulatable list (MOD_DESTS) does not include them.

/** Mod sources, in index order. `src` param values index into this list. */
export const MOD_SOURCES: readonly string[] = (() => {
  const s: string[] = ["none"];
  for (let i = 1; i <= LFO_COUNT; i++) s.push(`lfo${i}`);
  for (let i = 1; i <= ENV_COUNT; i++) s.push(`env${i}`);
  for (let i = 1; i <= FUNC_COUNT; i++) s.push(`func${i}`);
  for (let i = 1; i <= MACRO_COUNT; i++) s.push(`macro${i}`);
  for (let i = 1; i <= XY_COUNT; i++) { s.push(`xy${i}.x`); s.push(`xy${i}.y`); }
  s.push("velocity", "modwheel", "aftertouch", "keytrack", "chaos", "noteRandom", "ampEnv", "filterEnv");
  return s;
})();

/** Indexes (into PARAMS) of every modulatable parameter, in order. `dst` param values index into this list. */
export const MOD_DESTS: readonly number[] = list.map((p, i) => (p.modulatable ? i : -1)).filter((i) => i >= 0);

for (let i = 1; i <= MOD_SLOTS; i++) {
  int(`mod${i}.src`, `Mod ${i} Source`, "mod", 0, MOD_SOURCES.length - 1, 0);
  int(`mod${i}.dst`, `Mod ${i} Dest`, "mod", 0, MOD_DESTS.length - 1, 0);
  // Amount is in NORMALISED units of the destination: +1 sweeps the full range.
  cont(`mod${i}.amount`, `Mod ${i} Amount`, "mod", -1, 1, 0, { modulatable: false });
}

export const PARAMS: readonly ParamSpec[] = list;
export const PARAM_COUNT = PARAMS.length;

const indexById = new Map<string, number>();
PARAMS.forEach((p, i) => indexById.set(p.id, i));

/** Index of a param by id. Throws on an unknown id (catches typos at dev time). */
export function paramIndex(id: string): number {
  const i = indexById.get(id);
  if (i === undefined) throw new Error(`insanity: unknown param "${id}"`);
  return i;
}
export function hasParam(id: string): boolean {
  return indexById.has(id);
}

/** Default values for every param, in index order. */
export function defaultValues(): Float32Array {
  const v = new Float32Array(PARAM_COUNT);
  for (let i = 0; i < PARAM_COUNT; i++) v[i] = PARAMS[i].def;
  return v;
}

/** Real value → 0..1 (log params are log-mapped). */
export function toNorm(p: ParamSpec, value: number): number {
  if (p.max === p.min) return 0;
  if (p.skew === "log" && p.min > 0) {
    const n = Math.log(value / p.min) / Math.log(p.max / p.min);
    return n < 0 ? 0 : n > 1 ? 1 : n;
  }
  const n = (value - p.min) / (p.max - p.min);
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/** 0..1 → real value, quantised for int/enum/bool. */
export function fromNorm(p: ParamSpec, norm: number): number {
  const n = norm < 0 ? 0 : norm > 1 ? 1 : norm;
  let v = p.skew === "log" && p.min > 0 ? p.min * Math.pow(p.max / p.min, n) : p.min + n * (p.max - p.min);
  if (p.kind !== "cont") v = Math.round(v);
  return v;
}

/** Clamp + quantise a real value to the param's range. */
export function clampParam(p: ParamSpec, value: number): number {
  if (!Number.isFinite(value)) return p.def;
  let v = value < p.min ? p.min : value > p.max ? p.max : value;
  if (p.kind !== "cont") v = Math.round(v);
  return v;
}

/** Short display string for a value. */
export function formatParam(p: ParamSpec, value: number): string {
  if (p.kind === "enum" && p.options) return p.options[Math.round(value)] ?? "?";
  if (p.kind === "bool") return value >= 0.5 ? "ON" : "OFF";
  if (p.kind === "int") return String(Math.round(value));
  const a = Math.abs(value);
  const s = a >= 1000 ? `${(value / 1000).toFixed(a >= 10000 ? 1 : 2)}k` : a >= 100 ? value.toFixed(0) : a >= 10 ? value.toFixed(1) : value.toFixed(2);
  return p.unit ? `${s}${p.unit === "Hz" && a >= 1000 ? "Hz" : p.unit}` : s;
}
