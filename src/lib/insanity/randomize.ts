// INSANITY — the randomizer.
//
// randomize(values, groups, amount) returns a NEW Float32Array. Only params in the
// chosen groups move. `amount` (0..1) blends from the current value toward a random
// target in normalised space, so 0.1 nudges and 1 rerolls. Per-group rules keep the
// result musical-ish:
//   • master.volume and master.ceiling are never touched; global.destroyCpu is never
//     switched ON (it may be switched off).
//   • amp attack stays short most of the time; release stays sane.
//   • osc levels stay moderate and at least one oscillator is left on.
//   • voice filter 1 stays LP/BP above ~200 Hz; filter 2 keeps its type and stays low;
//     filter-bank bands only become peak/notch.
//   • fx mixes are capped, delay feedback stays below runaway.
//   • mod amounts scale with `amount`; at most a handful of slots get a route, never
//     to master volume / ceiling.
//   • layers are never switched on (they load audio code), only their knobs move.

import {
  MOD_DESTS, MOD_SLOTS, MOD_SOURCES, OSC_COUNT, OSC_MODES, PARAMS, clampParam, fromNorm, paramIndex, toNorm, type ParamGroup,
} from "./params";

/** Groups the RANDOMIZER SUPREME offers, with panel labels. */
export const RANDOM_GROUPS: readonly { group: ParamGroup; label: string }[] = [
  { group: "osc", label: "Oscillators" },
  { group: "voice", label: "Envelopes + Filters" },
  { group: "bank", label: "Filter Bank (32x)" },
  { group: "fx", label: "Effects Galaxy" },
  { group: "lfo", label: "LFOs" },
  { group: "env", label: "Mod Envelopes" },
  { group: "func", label: "Functions" },
  { group: "macro", label: "Macros" },
  { group: "xy", label: "XY Pads" },
  { group: "mod", label: "Mod Matrix" },
  { group: "chaos", label: "Chaos Engine" },
  { group: "master", label: "Master (safe bits)" },
  { group: "layer", label: "Layer Knobs" },
];

const NEVER = new Set(["master.volume", "master.ceiling", "global.tempo", "voice.polyphony", "voice.bendRange", "vf2.type"]);

/** Per-id target ranges in REAL units (overrides the full param range). */
const RANGE: Record<string, [number, number]> = {
  "amp.decay": [0.05, 2],
  "amp.release": [0.03, 2.5],
  "fenv.attack": [0.001, 0.5],
  "fenv.decay": [0.05, 1.5],
  "vf1.cutoff": [200, 12000],
  "vf1.reso": [0, 0.75],
  "vf2.cutoff": [20, 400],
  "vf2.reso": [0, 0.5],
  "voice.glide": [0, 0.15],
  "fx.drive.db": [0, 12],
  "fx.delay.feedback": [0, 0.7],
  "fx.width": [0.6, 1.8],
  "master.eqLow": [-4, 4],
  "master.eqMid": [-4, 4],
  "master.eqHigh": [-4, 4],
  "master.compThresh": [-24, -6],
  "master.compRatio": [1.5, 6],
  "master.clipper": [0, 0.3],
  "layer.braids.level": [0.3, 0.9],
  "layer.breezaphone.level": [0.3, 0.9],
  "layer.pollen.level": [0.3, 0.9],
  "layer.exciton.level": [0.3, 0.9],
};

function rnd(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

export function randomize(values: ArrayLike<number>, groups: ReadonlySet<ParamGroup>, amount: number): Float32Array {
  const amt = Math.max(0, Math.min(1, Number.isFinite(amount) ? amount : 0));
  const out = Float32Array.from(values as ArrayLike<number>);
  if (amt === 0 || groups.size === 0) return out;

  const set = (id: string, v: number): void => {
    const i = paramIndex(id);
    out[i] = clampParam(PARAMS[i], v);
  };
  /** Blend param i toward a target value (real units) by amt, in normalised space. */
  const blend = (i: number, target: number): void => {
    const p = PARAMS[i];
    const n0 = toNorm(p, out[i]);
    const n1 = toNorm(p, target);
    out[i] = clampParam(p, fromNorm(p, n0 + (n1 - n0) * amt));
  };
  /** Discrete params flip to a random option with probability amt. */
  const flip = (i: number, pick: () => number): void => {
    if (Math.random() < amt) out[i] = clampParam(PARAMS[i], pick());
  };

  for (let i = 0; i < PARAMS.length; i++) {
    const p = PARAMS[i];
    if (!groups.has(p.group) || NEVER.has(p.id) || p.group === "mod" || p.group === "global") continue;
    if (p.id.endsWith(".on") && p.group === "layer") continue;
    if (p.id === "amp.attack") {
      // Mostly snappy; one roll in five gets a slow pad attack.
      blend(i, Math.random() < 0.8 ? rnd(0.001, 0.04) : rnd(0.2, 1.5));
      continue;
    }
    if (p.id === "amp.sustain") { blend(i, rnd(0.3, 1)); continue; }
    // Filter 1 stays a lowpass / bandpass (an HP at 12 kHz is just silence).
    if (p.id === "vf1.type") { flip(i, () => (Math.random() < 0.8 ? 0 : 2)); continue; }
    if (p.group === "osc") {
      const field = p.id.split(".")[1];
      if (field === "mode") { flip(i, () => Math.floor(rnd(0, OSC_MODES.length))); continue; }
      if (field === "level") { blend(i, rnd(0.15, 0.5)); continue; }
      if (field === "coarse") { flip(i, () => [-24, -12, -12, 0, 0, 0, 7, 12][Math.floor(rnd(0, 8))]); continue; }
      if (field === "fine") { blend(i, rnd(-12, 12)); continue; }
      if (field === "unison") { flip(i, () => Math.floor(rnd(1, 6))); continue; }
      if (field === "detune") { blend(i, rnd(0.05, 0.4)); continue; }
    }
    if (p.group === "fx" && p.id.endsWith(".mix")) { blend(i, rnd(0, 0.4)); continue; }
    if (p.group === "bank") {
      if (p.id.endsWith(".on")) { flip(i, () => (Math.random() < 0.25 ? 1 : 0)); continue; }
      // Bank bands stay peak / notch so a random band can't cut the whole signal.
      if (p.id.endsWith(".type")) { flip(i, () => (Math.random() < 0.8 ? 0 : 4)); continue; }
      if (p.id.endsWith(".gain")) { blend(i, rnd(-9, 9)); continue; }
    }
    const r = RANGE[p.id];
    if (p.kind === "cont") blend(i, r ? rnd(r[0], r[1]) : fromNorm(p, Math.random()));
    else flip(i, () => fromNorm(p, Math.random()));
  }

  if (groups.has("osc")) {
    // Keep it audible and not deafening: at least one osc on, total level bounded.
    const modes = Array.from({ length: OSC_COUNT }, (_, k) => paramIndex(`osc${k + 1}.mode`));
    if (modes.every((m) => out[m] === 0)) out[modes[0]] = 3; // saw
    let total = 0;
    for (let k = 1; k <= OSC_COUNT; k++) if (out[paramIndex(`osc${k}.mode`)] !== 0) total += out[paramIndex(`osc${k}.level`)];
    if (total > 1.4) for (let k = 1; k <= OSC_COUNT; k++) set(`osc${k}.level`, out[paramIndex(`osc${k}.level`)] * (1.4 / total));
  }

  if (groups.has("mod")) {
    // Scale every existing amount, then reroll up to a few routes.
    for (let s = 1; s <= MOD_SLOTS; s++) {
      const ai = paramIndex(`mod${s}.amount`);
      out[ai] = clampParam(PARAMS[ai], out[ai] * (1 - amt * 0.5));
    }
    const unsafe = new Set(["master.volume", "master.ceiling"].map((id) => MOD_DESTS.indexOf(paramIndex(id))));
    const routes = Math.round(amt * 6);
    for (let k = 0; k < routes; k++) {
      const s = 1 + Math.floor(rnd(0, MOD_SLOTS));
      set(`mod${s}.src`, 1 + Math.floor(rnd(0, MOD_SOURCES.length - 1)));
      let dst = Math.floor(rnd(0, MOD_DESTS.length));
      while (unsafe.has(dst)) dst = Math.floor(rnd(0, MOD_DESTS.length));
      set(`mod${s}.dst`, dst);
      set(`mod${s}.amount`, rnd(-0.35, 0.35) * amt);
    }
  }

  if (groups.has("global")) {
    // destroyCpu may only ever be turned OFF by the randomizer.
    const i = paramIndex("global.destroyCpu");
    if (Math.random() < amt * 0.5) out[i] = 0;
  }
  return out;
}
