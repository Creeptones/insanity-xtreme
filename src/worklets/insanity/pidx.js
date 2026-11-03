// INSANITY worklet — param index constants, resolved once from the shared table
// (src/lib/insanity/params.ts). Strides and field offsets are derived from the ids,
// so a reorder of params.ts cannot silently misalign the engine.

import { paramIndex, PARAMS } from "@/lib/insanity/params";

const d = (a, b) => paramIndex(b) - paramIndex(a);

export const P = {
  // oscillators: osc{i}.mode/level/coarse/fine/pan/shape/ratio/unison/detune
  osc: paramIndex("osc1.mode"),
  oscStride: d("osc1.mode", "osc2.mode"),
  oMode: 0,
  oLevel: d("osc1.mode", "osc1.level"),
  oCoarse: d("osc1.mode", "osc1.coarse"),
  oFine: d("osc1.mode", "osc1.fine"),
  oPan: d("osc1.mode", "osc1.pan"),
  oShape: d("osc1.mode", "osc1.shape"),
  oRatio: d("osc1.mode", "osc1.ratio"),
  oUnison: d("osc1.mode", "osc1.unison"),
  oDetune: d("osc1.mode", "osc1.detune"),

  ampA: paramIndex("amp.attack"),
  ampD: paramIndex("amp.decay"),
  ampS: paramIndex("amp.sustain"),
  ampR: paramIndex("amp.release"),
  fenvA: paramIndex("fenv.attack"),
  fenvD: paramIndex("fenv.decay"),
  fenvS: paramIndex("fenv.sustain"),
  fenvR: paramIndex("fenv.release"),

  vf1: paramIndex("vf1.type"),
  vfStride: d("vf1.type", "vf2.type"),
  fType: 0,
  fCutoff: d("vf1.type", "vf1.cutoff"),
  fReso: d("vf1.type", "vf1.reso"),
  fDrive: d("vf1.type", "vf1.drive"),
  fEnvAmt: d("vf1.type", "vf1.envAmt"),
  fKeytrack: d("vf1.type", "vf1.keytrack"),
  vfRouting: paramIndex("vf.routing"),
  glide: paramIndex("voice.glide"),
  polyphony: paramIndex("voice.polyphony"),
  bendRange: paramIndex("voice.bendRange"),

  lfo: paramIndex("lfo1.shape"),
  lfoStride: d("lfo1.shape", "lfo2.shape"),
  lShape: 0,
  lRate: d("lfo1.shape", "lfo1.rate"),
  lAmount: d("lfo1.shape", "lfo1.amount"),

  env: paramIndex("env1.attack"),
  envStride: d("env1.attack", "env2.attack"),
  eA: 0,
  eD: d("env1.attack", "env1.decay"),
  eS: d("env1.attack", "env1.sustain"),
  eR: d("env1.attack", "env1.release"),

  func: paramIndex("func1.mode"),
  funcStride: d("func1.mode", "func2.mode"),
  fnMode: 0,
  fnRate: d("func1.mode", "func1.rate"),
  fnSmooth: d("func1.mode", "func1.smooth"),

  macro: paramIndex("macro1"),
  xy: paramIndex("xy1.x"),

  chaosMu: paramIndex("chaos.mu"),
  chaosRate: paramIndex("chaos.rate"),
  chaosDrive: paramIndex("chaos.drive"),
  chaosAmount: paramIndex("chaos.amount"),

  destroyCpu: paramIndex("global.destroyCpu"),

  mod: paramIndex("mod1.src"),
  modStride: d("mod1.src", "mod2.src"),
  mSrc: 0,
  mDst: d("mod1.src", "mod1.dst"),
  mAmt: d("mod1.src", "mod1.amount"),
};

/**
 * Params [0, VOICE_PARAM_END) are the per-voice block (groups "osc" and "voice").
 * Every voice keeps its own modulated copy of this block. Computed, then verified
 * contiguous; if params.ts ever interleaves groups, the block falls back to the
 * longest contiguous prefix (later per-voice params are then treated as global).
 */
export const VOICE_PARAM_END = (() => {
  let i = 0;
  while (i < PARAMS.length && (PARAMS[i].group === "osc" || PARAMS[i].group === "voice")) i++;
  return i;
})();
