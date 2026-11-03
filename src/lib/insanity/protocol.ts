// INSANITY — messages between the page (InsanityHost) and the worklet
// (public/worklets/insanity-engine.js, processor name INSANITY_PROCESSOR_NAME).
//
// Node shape: new AudioWorkletNode(ctx, INSANITY_PROCESSOR_NAME, {
//   numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
//   processorOptions: { values: number[] }   // full PARAMS default/initial values, index order
// })
// Input 0 (stereo) carries the extra instrument LAYERS (Braids, Breezaphone, Pollen,
// Exciton). The worklet sums it with its own voices BEFORE the bus (filter bank → fx →
// master), so the master section and meters cover the layers too.
//
// All param values are REAL (denormalised) values, indexed by PARAMS position.
// Pure TS so the worklet can import it.

export const INSANITY_PROCESSOR_NAME = "insanity-engine";
/** File name under public/worklets/. The page builds the full URL (host.ts, via workletUrl). */
export const INSANITY_WORKLET_FILE = "insanity-engine.js";

// ---- page → worklet --------------------------------------------------------
export type ToWorklet =
  /** Replace every param value (preset load / reset). values.length === PARAM_COUNT. */
  | { type: "setAll"; values: Float32Array }
  /** Sparse batch of changed params. idx[k] gets val[k]. */
  | { type: "params"; idx: Int32Array; val: Float32Array }
  /**
   * Start a note. `id` is unique per note and is used to stop it. `freq` is in Hz and already
   * includes tuning (Scala / EDO). `note` is the fractional MIDI note for keytracking. vel is 0..1.
   */
  | { type: "noteOn"; id: number; freq: number; note: number; vel: number }
  | { type: "noteOff"; id: number }
  /** PANIC: hard-stop every voice and clear fx tails. */
  | { type: "panic" }
  /** Release every held voice (soft all-notes-off). */
  | { type: "allNotesOff" }
  /** Continuous performance controllers, 0..1 (pitchBend is -1..1). */
  | { type: "controller"; name: "modwheel" | "aftertouch" | "pitchBend"; value: number };

// ---- worklet → page --------------------------------------------------------
/** Posted ~30 times a second. */
export interface MeterReport {
  type: "meters";
  peakL: number;
  peakR: number;
  rmsL: number;
  rmsR: number;
  /** Voices currently sounding (including releasing). */
  voices: number;
  /** process() time as a fraction of the real-time budget for one block (0..1+, smoothed). */
  cpu: number;
  /** Compressor gain reduction in dB (>= 0). */
  gainReductionDb: number;
  /** Current bipolar value (-1..1) of each LFO, ENV (0..1), FUNC and the chaos source, for UI animation. */
  lfo: Float32Array;
  env: Float32Array;
  func: Float32Array;
  chaos: number;
  /** 128-sample decimated snapshot of the output (mono) for the scope. */
  scope: Float32Array;
}

export type FromWorklet = MeterReport | { type: "ready" } | { type: "error"; message: string };
