// INSANITY — factory presets and user-preset storage.
//
// A factory preset is a SPARSE override on top of defaultValues(): `values` sets
// params by id, `mods` fills mod-matrix slots 1..n in order (route() resolves the
// source name and destination param id to the index values the engine expects).
// `braidsModel` is the one main-thread setting a preset may carry (see
// layers/braidsLayer.ts).
//
// User presets are FULL value arrays in localStorage, keyed by name, with a version
// field. Every storage access is wrapped: private windows and blocked storage just
// mean "no user presets".

import { MOD_DESTS, MOD_SOURCES, PARAMS, PARAM_COUNT, clampParam, defaultValues, hasParam, paramIndex } from "./params";
import type { BraidsModelId } from "./layers/braidsLayer";

export type PresetType = "INIT" | "LEAD" | "BASS" | "PAD" | "KEYS" | "PLUCK" | "FX" | "DRONE" | "???";

export interface ModRoute {
  /** Index into MOD_SOURCES. */
  src: number;
  /** Index into MOD_DESTS. */
  dst: number;
  amount: number;
}

export interface FactoryPreset {
  name: string;
  type: PresetType;
  /** 1..5 stars. */
  rating: number;
  values: Record<string, number>;
  mods?: ModRoute[];
  braidsModel?: BraidsModelId;
}

/** Resolve a mod route by name: route("lfo1", "vf1.cutoff", 0.2). Throws on typos. */
export function route(srcName: string, dstParamId: string, amount: number): ModRoute {
  const src = MOD_SOURCES.indexOf(srcName);
  if (src < 0) throw new Error(`insanity: unknown mod source "${srcName}"`);
  const dst = MOD_DESTS.indexOf(paramIndex(dstParamId));
  if (dst < 0) throw new Error(`insanity: "${dstParamId}" is not modulatable`);
  return { src, dst, amount: Math.max(-1, Math.min(1, amount)) };
}

/** Defaults + a preset's overrides + its mod routes, clamped. */
export function buildPresetValues(p: Pick<FactoryPreset, "values" | "mods">): Float32Array {
  const v = defaultValues();
  for (const [id, val] of Object.entries(p.values)) {
    if (!hasParam(id)) continue;
    const i = paramIndex(id);
    v[i] = clampParam(PARAMS[i], val);
  }
  (p.mods ?? []).forEach((m, k) => {
    const slot = k + 1;
    v[paramIndex(`mod${slot}.src`)] = m.src;
    v[paramIndex(`mod${slot}.dst`)] = m.dst;
    v[paramIndex(`mod${slot}.amount`)] = m.amount;
  });
  return v;
}

export const DEFAULT_PRESET_NAME = "ALL OF THE SOUNDS EVER MADE AND MORE";

// Mode indexes into OSC_MODES: off sine tri saw square noise wavetable fm additive chaos.
const OFF = 0, SINE = 1, TRI = 2, SAW = 3, SQUARE = 4, NOISE = 5, WT = 6, FM = 7, ADD = 8, CHAOS = 9;
// LFO shapes: sine tri saw square random. FILTER_TYPES: lp hp bp notch.
const LFO_SINE = 0, LFO_TRI = 1, LFO_RANDOM = 4;
const LP = 0, HP = 1, BP = 2;

/** Silences osc2 (on by default) so single-osc patches stay clean. */
const osc2Off = { "osc2.mode": OFF };

export const MAGIC_PRESET: FactoryPreset = {
  name: "Make It Sound Good™",
  type: "KEYS",
  rating: 5,
  values: {
    "osc1.mode": SAW, "osc1.level": 0.42, "osc1.unison": 3, "osc1.detune": 0.16,
    "osc2.mode": SQUARE, "osc2.level": 0.28, "osc2.coarse": -12, "osc2.fine": 4, "osc2.shape": 0.35,
    "osc3.mode": TRI, "osc3.level": 0.15, "osc3.coarse": 12,
    "amp.attack": 0.015, "amp.decay": 0.9, "amp.sustain": 0.65, "amp.release": 0.9,
    "fenv.attack": 0.005, "fenv.decay": 0.6, "fenv.sustain": 0.25, "fenv.release": 0.8,
    "vf1.type": LP, "vf1.cutoff": 1900, "vf1.reso": 0.22, "vf1.envAmt": 0.32, "vf1.keytrack": 0.4,
    "lfo1.shape": LFO_SINE, "lfo1.rate": 0.18,
    "fx.chorus.mix": 0.35, "fx.chorus.rate": 0.35, "fx.chorus.depth": 0.4,
    "fx.delay.time": 375, "fx.delay.feedback": 0.32, "fx.delay.mix": 0.18, "fx.delay.damping": 0.55,
    "fx.reverb.size": 0.75, "fx.reverb.mix": 0.3, "fx.width": 1.3,
    "master.compThresh": -16, "master.compRatio": 2.5,
  },
  mods: [route("lfo1", "vf1.cutoff", 0.06), route("velocity", "vf1.envAmt", 0.2)],
};

export const FACTORY_PRESETS: readonly FactoryPreset[] = [
  { name: DEFAULT_PRESET_NAME, type: "INIT", rating: 3, values: {} },
  {
    name: "Absolute Madness",
    type: "FX",
    rating: 5,
    values: {
      "osc1.mode": CHAOS, "osc1.level": 0.35, "osc1.shape": 0.6,
      "osc2.mode": FM, "osc2.level": 0.35, "osc2.coarse": 7, "osc2.ratio": 3.01, "osc2.shape": 0.5,
      "osc3.mode": SAW, "osc3.level": 0.3, "osc3.unison": 5, "osc3.detune": 0.45, "osc3.coarse": -12,
      "vf1.cutoff": 3200, "vf1.reso": 0.55, "vf1.envAmt": 0.4,
      "lfo1.shape": LFO_RANDOM, "lfo1.rate": 6,
      "lfo2.shape": LFO_SINE, "lfo2.rate": 0.31,
      "chaos.rate": 3, "chaos.mu": 2.5,
      "fx.ring.mix": 0.22, "fx.ring.freq": 330, "fx.phaser.mix": 0.45, "fx.phaser.rate": 0.6,
      "fx.delay.mix": 0.3, "fx.delay.feedback": 0.55, "fx.delay.time": 250,
      "fx.reverb.mix": 0.35, "fx.reverb.size": 0.85, "fx.width": 1.7,
    },
    mods: [
      route("lfo1", "vf1.cutoff", 0.25), route("chaos", "osc2.shape", 0.4),
      route("noteRandom", "osc1.pan", 0.8), route("lfo2", "fx.ring.freq", 0.3),
    ],
  },
  {
    name: "CPU Destroyer",
    type: "LEAD",
    rating: 5,
    values: {
      "global.destroyCpu": 1,
      "osc1.mode": SAW, "osc1.level": 0.32, "osc1.unison": 8, "osc1.detune": 0.35,
      "osc2.mode": SAW, "osc2.level": 0.22, "osc2.coarse": 12, "osc2.fine": 0, "osc2.unison": 8, "osc2.detune": 0.3,
      "osc3.mode": SQUARE, "osc3.level": 0.18, "osc3.coarse": -12, "osc3.unison": 8, "osc3.detune": 0.2,
      "amp.attack": 0.01, "amp.sustain": 0.9, "amp.release": 0.6,
      "vf1.cutoff": 6000, "vf1.reso": 0.1, "vf1.envAmt": 0.15,
      "fx.chorus.mix": 0.3, "fx.reverb.mix": 0.3, "fx.reverb.size": 0.8, "fx.delay.mix": 0.15, "fx.width": 1.6,
      "master.compThresh": -18, "master.compRatio": 4,
    },
  },
  {
    name: "Banger 9000",
    type: "LEAD",
    rating: 4,
    values: {
      "osc1.mode": SAW, "osc1.level": 0.5, "osc1.unison": 4, "osc1.detune": 0.22,
      "osc2.mode": SQUARE, "osc2.level": 0.3, "osc2.coarse": 0, "osc2.fine": -6, "osc2.shape": 0.3,
      "amp.attack": 0.002, "amp.decay": 0.25, "amp.sustain": 0.55, "amp.release": 0.18,
      "fenv.decay": 0.22, "fenv.sustain": 0.15,
      "vf1.cutoff": 1400, "vf1.reso": 0.35, "vf1.envAmt": 0.55, "vf1.drive": 0.3,
      "fx.drive.db": 9, "fx.drive.mix": 0.45,
      "fx.delay.time": 375, "fx.delay.mix": 0.22, "fx.delay.feedback": 0.4,
      "fx.reverb.mix": 0.18, "master.clipper": 0.25,
      "lfo2.shape": LFO_SINE, "lfo2.rate": 5,
    },
    mods: [route("modwheel", "osc1.fine", 0.08), route("velocity", "vf1.cutoff", 0.15)],
  },
  {
    name: "Emotional Pad (Sad)",
    type: "PAD",
    rating: 5,
    values: {
      "osc1.mode": SAW, "osc1.level": 0.4, "osc1.unison": 4, "osc1.detune": 0.25,
      "osc2.mode": TRI, "osc2.level": 0.25, "osc2.coarse": 12, "osc2.fine": 0,
      "osc3.mode": ADD, "osc3.level": 0.2, "osc3.coarse": -12, "osc3.shape": 0.7, "osc3.ratio": 1,
      "amp.attack": 1.2, "amp.decay": 1.5, "amp.sustain": 0.85, "amp.release": 3,
      "fenv.attack": 1.5, "fenv.decay": 2, "fenv.sustain": 0.4,
      "vf1.cutoff": 1100, "vf1.reso": 0.2, "vf1.envAmt": 0.2,
      "lfo1.shape": LFO_SINE, "lfo1.rate": 0.15,
      "fx.chorus.mix": 0.5, "fx.chorus.rate": 0.25, "fx.chorus.depth": 0.5,
      "fx.delay.mix": 0.25, "fx.delay.feedback": 0.45, "fx.delay.time": 500,
      "fx.reverb.size": 0.92, "fx.reverb.mix": 0.5, "fx.width": 1.5,
    },
    mods: [route("lfo1", "vf1.cutoff", 0.12), route("lfo1", "osc2.pan", 0.5)],
  },
  {
    name: "The Final Bass",
    type: "BASS",
    rating: 4,
    values: {
      "osc1.mode": SAW, "osc1.level": 0.5, "osc1.coarse": -12,
      "osc2.mode": SQUARE, "osc2.level": 0.35, "osc2.coarse": -24, "osc2.fine": 0, "osc2.shape": 0.5,
      "osc3.mode": SINE, "osc3.level": 0.4, "osc3.coarse": -24,
      "voice.polyphony": 1, "voice.glide": 0.04,
      "amp.attack": 0.002, "amp.decay": 0.4, "amp.sustain": 0.8, "amp.release": 0.1,
      "fenv.decay": 0.25, "fenv.sustain": 0,
      "vf1.cutoff": 280, "vf1.reso": 0.35, "vf1.envAmt": 0.5, "vf1.keytrack": 0.5,
      "fx.drive.db": 6, "fx.drive.mix": 0.4,
      "fx.delay.mix": 0, "fx.reverb.mix": 0, "master.clipper": 0.2, "master.eqLow": 2,
    },
  },
  {
    name: "The Fever Lashes",
    type: "???",
    rating: 2,
    values: {
      "osc1.mode": FM, "osc1.level": 0.45, "osc1.ratio": 3.5, "osc1.shape": 0.6,
      "osc2.mode": CHAOS, "osc2.level": 0.15, "osc2.shape": 0.3,
      "amp.attack": 0.005, "amp.decay": 0.8, "amp.sustain": 0.3, "amp.release": 1.2,
      "vf1.cutoff": 5000, "vf1.envAmt": 0.1,
      "lfo5.shape": LFO_RANDOM, "lfo5.rate": 4,
      "fx.crush.bits": 8, "fx.crush.rate": 3, "fx.crush.mix": 0.3,
      "fx.ring.mix": 0.25, "fx.ring.freq": 440,
      "fx.delay.mix": 0.35, "fx.delay.feedback": 0.6, "fx.delay.time": 333,
      "fx.reverb.mix": 0.3,
    },
    mods: [route("lfo5", "osc1.shape", 0.3), route("ampEnv", "osc1.ratio", 0.1)],
  },
  { name: "Supersaw", type: "LEAD", rating: 4, values: {
    "osc1.mode": SAW, "osc1.level": 0.45, "osc1.unison": 7, "osc1.detune": 0.3,
    "osc2.mode": SAW, "osc2.level": 0.25, "osc2.coarse": 12, "osc2.fine": 0, "osc2.unison": 5, "osc2.detune": 0.25,
    "amp.attack": 0.005, "amp.sustain": 0.9, "amp.release": 0.45,
    "vf1.cutoff": 6500, "vf1.reso": 0.1, "vf1.envAmt": 0.1,
    "fx.chorus.mix": 0.25, "fx.reverb.mix": 0.3, "fx.reverb.size": 0.75, "fx.delay.mix": 0.18, "fx.width": 1.5,
  } },
  { name: "Acid-ish", type: "BASS", rating: 4, values: {
    ...osc2Off,
    "osc1.mode": SAW, "osc1.level": 0.65,
    "voice.polyphony": 1, "voice.glide": 0.06,
    "amp.attack": 0.002, "amp.decay": 0.3, "amp.sustain": 0.7, "amp.release": 0.08,
    "fenv.attack": 0.001, "fenv.decay": 0.18, "fenv.sustain": 0,
    "vf1.cutoff": 350, "vf1.reso": 0.82, "vf1.envAmt": 0.7, "vf1.drive": 0.4, "vf1.keytrack": 0.3,
    "fx.drive.db": 8, "fx.drive.mix": 0.3, "fx.delay.time": 375, "fx.delay.mix": 0.22, "fx.delay.feedback": 0.45,
    "fx.reverb.mix": 0.1,
  }, mods: [route("velocity", "vf1.envAmt", 0.25), route("modwheel", "vf1.cutoff", 0.35)] },
  { name: "FM Bell", type: "KEYS", rating: 5, values: {
    "osc1.mode": FM, "osc1.level": 0.5, "osc1.ratio": 3.5, "osc1.shape": 0.4,
    "osc2.mode": SINE, "osc2.level": 0.18, "osc2.coarse": 12, "osc2.fine": 3,
    "amp.attack": 0.002, "amp.decay": 2.5, "amp.sustain": 0, "amp.release": 2,
    "vf1.cutoff": 12000, "vf1.envAmt": 0, "vf1.reso": 0,
    "fx.delay.mix": 0.2, "fx.delay.time": 450, "fx.reverb.mix": 0.4, "fx.reverb.size": 0.8,
  }, mods: [route("ampEnv", "osc1.shape", 0.35), route("velocity", "osc1.shape", 0.15)] },
  { name: "Additive Organ", type: "KEYS", rating: 4, values: {
    "osc1.mode": ADD, "osc1.level": 0.45, "osc1.shape": 0.3, "osc1.ratio": 1,
    "osc2.mode": ADD, "osc2.level": 0.25, "osc2.coarse": 12, "osc2.fine": 0, "osc2.shape": 0.6, "osc2.ratio": 1,
    "osc3.mode": SINE, "osc3.level": 0.3, "osc3.coarse": -12,
    "amp.attack": 0.008, "amp.decay": 0.1, "amp.sustain": 1, "amp.release": 0.12,
    "vf1.cutoff": 9000, "vf1.envAmt": 0, "vf1.reso": 0,
    "fx.chorus.mix": 0.45, "fx.chorus.rate": 5.5, "fx.chorus.depth": 0.35,
    "fx.reverb.mix": 0.25, "fx.delay.mix": 0,
  } },
  { name: "Chaos Drone", type: "DRONE", rating: 4, values: {
    "osc1.mode": CHAOS, "osc1.level": 0.4, "osc1.coarse": -12, "osc1.shape": 0.4,
    "osc2.mode": SAW, "osc2.level": 0.28, "osc2.coarse": -24, "osc2.fine": 5, "osc2.unison": 3, "osc2.detune": 0.2,
    "osc3.mode": NOISE, "osc3.level": 0.06, "osc3.shape": 0.3,
    "amp.attack": 2, "amp.decay": 2, "amp.sustain": 1, "amp.release": 5,
    "vf1.type": LP, "vf1.cutoff": 750, "vf1.reso": 0.5, "vf1.envAmt": 0,
    "chaos.rate": 0.3, "chaos.mu": 1.8,
    "lfo1.shape": LFO_TRI, "lfo1.rate": 0.07,
    "fx.reverb.mix": 0.6, "fx.reverb.size": 0.95, "fx.delay.mix": 0.3, "fx.delay.feedback": 0.6, "fx.delay.time": 700,
    "fx.phaser.mix": 0.3, "fx.phaser.rate": 0.1,
  }, mods: [route("chaos", "vf1.cutoff", 0.25), route("lfo1", "osc1.shape", 0.2)] },
  { name: "Physical Pluck", type: "PLUCK", rating: 5, braidsModel: "pluck", values: {
    ...osc2Off,
    "osc1.mode": TRI, "osc1.level": 0.22,
    "amp.attack": 0.002, "amp.decay": 0.6, "amp.sustain": 0, "amp.release": 0.4,
    "vf1.cutoff": 4000, "vf1.envAmt": 0.2,
    "layer.braids.on": 1, "layer.braids.level": 0.85,
    "layer.braids.a": 0.45, "layer.braids.b": 0.7, "layer.braids.c": 0.7, "layer.braids.d": 0.45,
    "fx.reverb.mix": 0.3, "fx.delay.mix": 0.15,
  } },
  { name: "Atmos", type: "PAD", rating: 4, values: {
    ...osc2Off,
    "osc1.mode": SINE, "osc1.level": 0.18,
    "amp.attack": 1.5, "amp.sustain": 1, "amp.release": 2.5,
    "layer.pollen.on": 1, "layer.pollen.level": 0.8,
    "layer.pollen.a": 0.75, "layer.pollen.b": 0.6, "layer.pollen.c": 0.35, "layer.pollen.d": 0.4,
    "fx.reverb.mix": 0.55, "fx.reverb.size": 0.9, "fx.delay.mix": 0.25, "fx.chorus.mix": 0.3, "fx.width": 1.6,
  } },
  { name: "Wind Section (Unpaid)", type: "LEAD", rating: 3, values: {
    ...osc2Off,
    "osc1.mode": OFF,
    "layer.breezaphone.on": 1, "layer.breezaphone.level": 0.85,
    "layer.breezaphone.a": 0.45, "layer.breezaphone.b": 0.55, "layer.breezaphone.c": 0.3, "layer.breezaphone.d": 0.05,
    "fx.reverb.mix": 0.3, "fx.delay.mix": 0.12,
  } },
  { name: "Quantum Glass", type: "KEYS", rating: 4, values: {
    ...osc2Off,
    "osc1.mode": SINE, "osc1.level": 0.15, "osc1.coarse": 12,
    "amp.decay": 1.2, "amp.sustain": 0.4, "amp.release": 1.5,
    "layer.exciton.on": 1, "layer.exciton.level": 0.8,
    "layer.exciton.a": 0.35, "layer.exciton.b": 0.6, "layer.exciton.c": 0.7, "layer.exciton.d": 0.15,
    "fx.reverb.mix": 0.45, "fx.reverb.size": 0.85, "fx.delay.mix": 0.2,
  } },
  { name: "Not a Lead", type: "PAD", rating: 1, values: {
    "osc1.mode": SQUARE, "osc1.level": 0.35, "osc1.shape": 0.2,
    "osc2.mode": WT, "osc2.level": 0.3, "osc2.coarse": 0, "osc2.fine": 0, "osc2.shape": 0.3,
    "amp.attack": 0.6, "amp.sustain": 0.8, "amp.release": 1.8,
    "vf1.type": BP, "vf1.cutoff": 900, "vf1.reso": 0.4, "vf1.envAmt": 0.1,
    "vf2.type": HP, "vf2.cutoff": 120,
    "lfo3.shape": LFO_SINE, "lfo3.rate": 0.2,
    "fx.phaser.mix": 0.4, "fx.reverb.mix": 0.4,
  }, mods: [route("lfo3", "osc2.shape", 0.35), route("lfo3", "vf1.cutoff", 0.15)] },
  MAGIC_PRESET,
];

// ---- user presets -----------------------------------------------------------

export const USER_PRESET_VERSION = 1;
const STORAGE_KEY = "insanity.userPresets.v1";

export interface UserPreset {
  version: number;
  name: string;
  /** Every param value, index order (length PARAM_COUNT when saved). */
  values: number[];
  braidsModel?: BraidsModelId;
  savedAt: number;
}

function readAll(): Record<string, UserPreset> {
  try {
    if (typeof localStorage === "undefined") return {};
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, UserPreset> = {};
    for (const [name, p] of Object.entries(parsed as Record<string, unknown>)) {
      const u = p as Partial<UserPreset> | null;
      if (u && Array.isArray(u.values) && typeof u.version === "number") {
        out[name] = { version: u.version, name, values: u.values.map(Number), braidsModel: u.braidsModel, savedAt: Number(u.savedAt) || 0 };
      }
    }
    return out;
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, UserPreset>): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

export function listUserPresets(): UserPreset[] {
  return Object.values(readAll()).sort((a, b) => a.name.localeCompare(b.name));
}

/** Saves (or overwrites) a user preset. Returns false when storage is unavailable. */
export function saveUserPreset(name: string, values: ArrayLike<number>, braidsModel?: BraidsModelId): boolean {
  const all = readAll();
  all[name] = { version: USER_PRESET_VERSION, name, values: Array.from(values), braidsModel, savedAt: Date.now() };
  return writeAll(all);
}

export function deleteUserPreset(name: string): boolean {
  const all = readAll();
  if (!(name in all)) return false;
  delete all[name];
  return writeAll(all);
}

/** A stored preset's values padded/trimmed to the current param table. */
export function userPresetValues(p: UserPreset): Float32Array {
  const v = defaultValues();
  const n = Math.min(PARAM_COUNT, p.values.length);
  for (let i = 0; i < n; i++) if (Number.isFinite(p.values[i])) v[i] = clampParam(PARAMS[i], p.values[i]);
  return v;
}
