// INSANITY — instrument layer contract.
//
// A layer is one of the site's existing instruments (Braids, Breezaphone, Pollen,
// Exciton) running as extra AudioWorkletNode(s) on the INSANITY AudioContext. Its
// output is one GainNode the manager connects to host.layerInput. It plays the same
// notes as the engine (fanned out through host.addNoteListener).
//
// Layer params live in params.ts as layer.<id>.{on,level,a,b,c,d}, all 0..1 except
// `on`. The host does not send them to the engine worklet; the manager forwards them
// here through setControls().

import type { LayerId } from "../params";

export interface LayerControls {
  level: number;
  a: number;
  b: number;
  c: number;
  d: number;
}

export interface LayerEngine {
  /** Layer output. The manager connects / disconnects it to host.layerInput. */
  readonly output: GainNode;
  noteOn(id: number, freq: number, note: number, vel: number): void;
  noteOff(id: number): void;
  /** Release every held note. */
  allNotesOff(): void;
  /** Hard stop (used when the layer is switched off). */
  panic(): void;
  setControls(c: LayerControls): void;
}

export type LayerStatus = "off" | "standby" | "loading" | "on" | "failed";

/** Panel labels for each layer's A/B/C/D knobs. */
export const LAYER_CONTROL_LABELS: Record<Exclude<LayerId, "braids">, readonly [string, string, string, string]> = {
  breezaphone: ["Excite", "Bright", "Air", "Growl"],
  pollen: ["Grain", "Density", "Spray", "Position"],
  exciton: ["Coupling", "Tonal", "Spread", "Decohere"],
};

/** Squared taper: level knob 0..1 → output gain (0.6 ≈ -9 dB). */
export function levelToGain(level: number): number {
  const l = level < 0 ? 0 : level > 1 ? 1 : level;
  return l * l;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Exponential interpolation (a, b > 0). */
export function expLerp(a: number, b: number, t: number): number {
  return a * Math.pow(b / a, t);
}

/** Smoothly set an AudioParam (no zipper noise, no throw if the param is missing). */
export function smoothSet(param: AudioParam | undefined | null, value: number, ctx: BaseAudioContext, tc = 0.03): void {
  if (!param || !Number.isFinite(value)) return;
  const v = Math.min(param.maxValue, Math.max(param.minValue, value));
  try {
    param.setTargetAtTime(v, ctx.currentTime, tc);
  } catch {
    param.value = v;
  }
}
