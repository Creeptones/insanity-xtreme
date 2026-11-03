"use client";

// INSANITY perf — performance side: keyboard / MIDI / matrix / chords / scale / arp /
// step sequencer / tuning. Wrap the page in <PerformanceProvider> (inside InsanityProvider);
// the panels take no props. Engine: src/lib/insanity/perf/engine.ts.

export { PerformanceProvider, usePerf } from "./PerformanceContext";
export { MidiMatrixPanel } from "./MidiMatrixPanel";
export { StepSequencerPanel } from "./StepSequencerPanel";
export { KeyboardPanel } from "./KeyboardPanel";
export { ScaleEditorPanel } from "./ScaleEditorPanel";
export { TuningPanel } from "./TuningPanel";
export { ChordMemoryPanel } from "./ChordMemoryPanel";
export { InputChooser, InputStatus } from "./InputChooser";
