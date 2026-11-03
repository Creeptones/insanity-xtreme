// INSANITY perf — the main-thread note pipeline. One PerformanceEngine per page,
// held by <PerformanceProvider>.
//
//   inputs (on-screen piano, computer keys, Web MIDI)
//     → MIDI matrix → chord memory → scale snap → arpeggiator ─┐
//   step sequencer (own clock, same tempo) ─────────────────────┤
//     → tuning (note → Hz) → host.noteOn / noteOff (unique ids per voice)
//
// Each held input remembers the voice ids it started, so a key release stops exactly
// its own chord / strum. Arp and sequencer voices are timed against
// host.ctx.currentTime: a 10 ms interval looks 25 ms ahead and places each note with a
// setTimeout at its audio-clock offset. Everything is a no-op until host.started.

import type { InsanityHost } from "../host";
import {
  CHORD_PRESETS, DEFAULT_MATRIX, SCALE_PRESETS, applyMatrix, buildArpPattern, degreeToNote, divisionSeconds,
  learnChord, noteName, snapToScale,
  type ArpMode, type ArpNote, type ChordSlot, type Division, type MatrixSettings,
} from "./theory";
import { DEFAULT_REF_HZ, TWELVE_TET, noteToHz, type Tuning } from "./tuning";

// ---- tiny change signal for useSyncExternalStore ---------------------------
export class Signal {
  version = 0;
  private subs = new Set<() => void>();
  subscribe = (f: () => void): (() => void) => {
    this.subs.add(f);
    return () => { this.subs.delete(f); };
  };
  getVersion = (): number => this.version;
  emit(): void {
    this.version++;
    this.subs.forEach((f) => f());
  }
}

// ---- settings ---------------------------------------------------------------
export interface ChordSettings { enabled: boolean; active: number; slots: ChordSlot[]; strumMs: number }
export interface ScaleSettings { enabled: boolean; root: number; mask: boolean[]; preset: string }
export interface ArpSettings { mode: ArpMode; octaves: number; rate: Division; gate: number; swing: number; latch: boolean }
export interface TuningSettings { tuning: Tuning; refHz: number }
export interface SeqCell { on: boolean; vel: number; prob: number; ratchet: number }
export interface SeqLane { offset: number; cells: SeqCell[] }
export type LaneMode = "semitones" | "degrees";
export interface SeqSettings {
  rate: Division; swing: number; gate: number; length: number; root: number;
  laneMode: LaneMode; holdTranspose: boolean; lanes: SeqLane[];
}
export interface PerfSettings {
  matrix: MatrixSettings; chord: ChordSettings; scale: ScaleSettings; arp: ArpSettings; seq: SeqSettings; tuning: TuningSettings;
}

export const SEQ_STEPS = 16;
export const SEQ_LANES = 8;

function emptyCell(): SeqCell { return { on: false, vel: 0.8, prob: 1, ratchet: 1 }; }

function defaultLanes(): SeqLane[] {
  // Top row = highest. Degrees 7..0 (an octave of the scale) by default.
  const offsets = [7, 6, 5, 4, 3, 2, 1, 0];
  const lanes = offsets.map((offset) => ({ offset, cells: Array.from({ length: SEQ_STEPS }, emptyCell) }));
  // A little starter pattern so PLAY makes sound immediately.
  const on = (lane: number, step: number, vel = 0.8): void => { lanes[lane].cells[step] = { ...lanes[lane].cells[step], on: true, vel }; };
  [0, 4, 8, 12].forEach((s) => on(7, s, 1));
  [2, 10].forEach((s) => on(5, s));
  [6, 14].forEach((s) => on(3, s, 0.6));
  on(0, 15, 0.5);
  return lanes;
}

export function defaultSettings(): PerfSettings {
  return {
    matrix: { ...DEFAULT_MATRIX },
    chord: { enabled: false, active: 0, slots: CHORD_PRESETS.map((c) => ({ name: c.name, intervals: [...c.intervals] })), strumMs: 0 },
    scale: { enabled: false, root: 0, mask: [...SCALE_PRESETS[1].mask], preset: "Major" },
    arp: { mode: "off", octaves: 1, rate: "1/16", gate: 0.6, swing: 0, latch: false },
    seq: { rate: "1/16", swing: 0, gate: 0.5, length: 16, root: 48, laneMode: "degrees", holdTranspose: false, lanes: defaultLanes() },
    tuning: { tuning: TWELVE_TET, refHz: DEFAULT_REF_HZ },
  };
}

// ---- runtime state ----------------------------------------------------------
interface InputRec {
  /** Note after the MIDI matrix (null when filtered). */
  matrixNote: number | null;
  rawNote: number;
  ids: number[];
  alive: boolean;
  mode: "direct" | "arp" | "transpose" | "none";
}

export interface MidiState {
  supported: boolean | null;
  enabled: boolean;
  error: string | null;
  devices: string[];
  monitor: string[];
  /**
   * Browser MIDI permission, probed on load without prompting:
   * "granted" (we auto-connect), "prompt" (needs a click), "denied", "unsupported", or null (not probed yet).
   */
  permission: "granted" | "prompt" | "denied" | "unsupported" | null;
  /** Name of the most recently connected device, for a short "connected" notice. */
  lastConnected: string | null;
  /** Whether the computer keyboard plays notes. */
  pcKeys: boolean;
}

export const KEY_MAP: Record<string, number> = {
  KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11,
  KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15, Semicolon: 16, Quote: 17,
};

const LOOKAHEAD = 0.025;
const TICK_MS = 10;

function isEditable(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA" || t.isContentEditable;
}

export class PerformanceEngine {
  settings: PerfSettings = defaultSettings();
  readonly settingsSig = new Signal();
  readonly notesSig = new Signal();
  readonly seqSig = new Signal();
  readonly midiSig = new Signal();
  readonly ctrlSig = new Signal();

  /** Base MIDI note of the computer keyboard's A key (and the on-screen piano's middle). */
  kbBase = 60;
  kbVel = 0.8;
  modwheel = 0;
  pitchBend = 0;
  aftertouch = 0;

  seqPlaying = false;
  seqPos = -1;
  midi: MidiState = { supported: null, enabled: false, error: null, devices: [], monitor: [], permission: null, lastConnected: null, pcKeys: true };

  private inputs = new Map<string, InputRec>();
  private pressed = new Map<number, number>();
  private sounding = new Map<number, number>(); // id → note
  private soundingCount = new Map<number, number>(); // note → count
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private interval: ReturnType<typeof setInterval> | null = null;
  private disposed = false;

  // arp
  private arpHeld: { key: string; notes: ArpNote[] }[] = [];
  private arpPattern: ArpNote[] = [];
  private arpStep = 0;
  private arpGrid: number | null = null;
  private arpIds = new Set<number>();
  // seq
  private seqStep = 0;
  private seqGrid = 0;
  private seqIds = new Set<number>();
  private transposeStack: { key: string; note: number }[] = [];
  private peakHeld: number[] = [];
  // midi
  private midiAccess: MIDIAccess | null = null;
  private unsubs: (() => void)[] = [];

  constructor(readonly host: InsanityHost) {}

  // ---- lifecycle ------------------------------------------------------------
  attach(): void {
    this.disposed = false;
    this.unsubs.push(this.host.onStarted(() => {
      if (this.interval === null && !this.disposed) this.interval = setInterval(() => this.tick(), TICK_MS);
    }));
    if (typeof window !== "undefined") {
      const down = (e: KeyboardEvent): void => this.onKeyDown(e);
      const up = (e: KeyboardEvent): void => this.onKeyUp(e);
      const blur = (): void => this.releaseSource("key:");
      const vis = (): void => { if (document.hidden) this.releaseSource("key:"); };
      window.addEventListener("keydown", down);
      window.addEventListener("keyup", up);
      window.addEventListener("blur", blur);
      document.addEventListener("visibilitychange", vis);
      void this.probeMidi();
      this.unsubs.push(() => {
        window.removeEventListener("keydown", down);
        window.removeEventListener("keyup", up);
        window.removeEventListener("blur", blur);
        document.removeEventListener("visibilitychange", vis);
      });
    }
  }

  dispose(): void {
    this.allOff();
    this.disposed = true;
    if (this.interval !== null) clearInterval(this.interval);
    this.interval = null;
    this.timers.forEach((t) => clearTimeout(t));
    this.timers.clear();
    this.unsubs.forEach((f) => f());
    this.unsubs = [];
    this.disableMidi();
  }

  /** Release every voice and forget every held input, arp note and transpose. */
  allOff(): void {
    for (const rec of this.inputs.values()) rec.alive = false;
    this.inputs.clear();
    this.pressed.clear();
    this.arpHeld = [];
    this.arpPattern = [];
    this.arpGrid = null;
    this.transposeStack = [];
    for (const id of [...this.sounding.keys()]) this.voiceOff(id);
    if (this.host.started) this.host.allNotesOff();
    this.notesSig.emit();
  }

  // ---- settings -------------------------------------------------------------
  update<K extends keyof PerfSettings>(key: K, patch: Partial<PerfSettings[K]>): void {
    const prev = this.settings[key];
    this.settings = { ...this.settings, [key]: { ...prev, ...patch } };
    if (key === "arp") {
      const a = this.settings.arp;
      if (a.mode === "off") this.clearArp();
      else {
        if (!a.latch) this.arpHeld = this.arpHeld.filter((h) => this.inputs.has(h.key));
        this.rebuildArp();
      }
    }
    if (key === "seq" && this.settings.seq.length <= this.seqStep) this.seqStep = 0;
    this.settingsSig.emit();
  }

  setCell(lane: number, step: number, patch: Partial<SeqCell>): void {
    const lanes = this.settings.seq.lanes.map((l, i) =>
      i !== lane ? l : { ...l, cells: l.cells.map((c, s) => (s === step ? { ...c, ...patch } : c)) });
    this.update("seq", { lanes });
  }
  setLaneOffset(lane: number, offset: number): void {
    const lanes = this.settings.seq.lanes.map((l, i) => (i === lane ? { ...l, offset } : l));
    this.update("seq", { lanes });
  }
  clearSeq(): void {
    this.update("seq", { lanes: this.settings.seq.lanes.map((l) => ({ ...l, cells: l.cells.map(emptyCell) })) });
  }
  randomizeSeq(density = 0.22): void {
    this.update("seq", {
      lanes: this.settings.seq.lanes.map((l) => ({
        ...l,
        cells: l.cells.map(() => ({
          on: Math.random() < density,
          vel: 0.4 + Math.random() * 0.6,
          prob: Math.random() < 0.8 ? 1 : 0.5,
          ratchet: Math.random() < 0.9 ? 1 : 2 + Math.floor(Math.random() * 3),
        })),
      })),
    });
  }

  setKbBase(base: number): void {
    this.kbBase = Math.max(12, Math.min(108, base));
    this.settingsSig.emit();
  }

  /**
   * Store the held (post-matrix) notes as the active chord slot. With nothing held, uses the
   * biggest set held together since the last time every key was up (so a mouse can click LEARN
   * after playing the chord). Returns false when there is nothing to learn.
   */
  learnChord(): boolean {
    const held = this.heldMatrixNotes();
    const notes = held.length > 0 ? held : this.peakHeld;
    if (notes.length === 0) return false;
    const c = this.settings.chord;
    const slots = c.slots.map((s, i) => (i === c.active ? { name: "learned", intervals: learnChord(notes) } : s));
    this.update("chord", { slots });
    return true;
  }

  // ---- queries for the UI ---------------------------------------------------
  isPressed(note: number): boolean { return (this.pressed.get(note) ?? 0) > 0; }
  isSounding(note: number): boolean { return (this.soundingCount.get(note) ?? 0) > 0; }
  soundingNotes(): number[] { return [...this.soundingCount.keys()]; }

  // ---- controllers ----------------------------------------------------------
  controller(name: "modwheel" | "aftertouch" | "pitchBend", value: number): void {
    if (name === "modwheel") this.modwheel = value;
    else if (name === "pitchBend") this.pitchBend = value;
    else this.aftertouch = value;
    if (this.host.started) this.host.controller(name, value);
    this.ctrlSig.emit();
  }

  // ---- input ----------------------------------------------------------------
  /** vel 0..1. channel 0 = untagged (screen / computer keys), 1..16 = MIDI. */
  noteOn(key: string, note: number, vel: number, channel = 0): void {
    if (this.inputs.has(key)) this.noteOff(key);
    this.pressed.set(note, (this.pressed.get(note) ?? 0) + 1);
    const rec: InputRec = { matrixNote: null, rawNote: note, ids: [], alive: true, mode: "none" };
    this.inputs.set(key, rec);
    this.notesSig.emit();
    if (!this.host.started) return;

    const m = applyMatrix(this.settings.matrix, note, vel, channel);
    if (!m) return;
    const before = this.heldMatrixNotes().length;
    rec.matrixNote = m.note;
    const held = this.heldMatrixNotes();
    if (before === 0 || held.length >= this.peakHeld.length) this.peakHeld = held;

    if (this.seqPlaying && this.settings.seq.holdTranspose) {
      rec.mode = "transpose";
      this.transposeStack.push({ key, note: m.note });
      return;
    }

    const notes = this.processNotes(m.note);
    if (this.settings.arp.mode !== "off") {
      rec.mode = "arp";
      if (this.settings.arp.latch && ![...this.inputs.entries()].some(([k, r]) => k !== key && r.mode === "arp")) this.arpHeld = [];
      this.arpHeld.push({ key, notes: notes.map((n) => ({ note: n, vel: m.vel })) });
      this.rebuildArp();
      return;
    }

    rec.mode = "direct";
    const strum = this.settings.chord.enabled ? this.settings.chord.strumMs / 1000 : 0;
    const now = this.now();
    notes.forEach((n, i) => {
      const play = (): void => { if (rec.alive) rec.ids.push(this.voiceOn(n, m.vel)); };
      if (i === 0 || strum <= 0) play();
      else this.at(now + i * strum, play);
    });
  }

  noteOff(key: string): void {
    const rec = this.inputs.get(key);
    if (!rec) return;
    this.inputs.delete(key);
    rec.alive = false;
    const p = (this.pressed.get(rec.rawNote) ?? 1) - 1;
    if (p > 0) this.pressed.set(rec.rawNote, p); else this.pressed.delete(rec.rawNote);
    rec.ids.forEach((id) => this.voiceOff(id));
    if (rec.mode === "transpose") this.transposeStack = this.transposeStack.filter((t) => t.key !== key);
    if (rec.mode === "arp" && !this.settings.arp.latch) {
      this.arpHeld = this.arpHeld.filter((h) => h.key !== key);
      this.rebuildArp();
    }
    this.notesSig.emit();
  }

  private heldMatrixNotes(): number[] {
    return [...this.inputs.values()].map((r) => r.matrixNote).filter((n): n is number => n !== null);
  }

  private releaseSource(prefix: string): void {
    for (const k of [...this.inputs.keys()]) if (k.startsWith(prefix)) this.noteOff(k);
  }

  /** chord memory → scale snap → dedupe/clamp. */
  private processNotes(note: number): number[] {
    const { chord, scale } = this.settings;
    const ivs = chord.enabled ? chord.slots[chord.active]?.intervals ?? [0] : [0];
    const out: number[] = [];
    for (const iv of ivs) {
      let n = note + iv;
      if (scale.enabled) n = snapToScale(n, scale.root, scale.mask);
      if (n >= 0 && n <= 127 && !out.includes(n)) out.push(n);
    }
    return out;
  }

  // ---- voices ---------------------------------------------------------------
  private voiceOn(note: number, vel: number): number {
    const id = this.host.newNoteId();
    const { tuning, refHz } = this.settings.tuning;
    const hz = noteToHz(tuning, note, refHz);
    this.host.noteOn(id, hz, 69 + 12 * Math.log2(hz / 440), vel);
    this.sounding.set(id, note);
    this.soundingCount.set(note, (this.soundingCount.get(note) ?? 0) + 1);
    this.notesSig.emit();
    return id;
  }

  private voiceOff(id: number): void {
    const note = this.sounding.get(id);
    if (note === undefined) return;
    this.sounding.delete(id);
    this.arpIds.delete(id);
    this.seqIds.delete(id);
    const c = (this.soundingCount.get(note) ?? 1) - 1;
    if (c > 0) this.soundingCount.set(note, c); else this.soundingCount.delete(note);
    if (this.host.started) this.host.noteOff(id);
    this.notesSig.emit();
  }

  // ---- clock ----------------------------------------------------------------
  private now(): number {
    return this.host.ctx?.currentTime ?? 0;
  }

  /** Run fn at audio time t (immediately if t is now or past). */
  private at(t: number, fn: () => void): void {
    const delay = (t - this.now()) * 1000;
    if (delay < 1) { fn(); return; }
    const h = setTimeout(() => {
      this.timers.delete(h);
      if (!this.disposed) fn();
    }, delay);
    this.timers.add(h);
  }

  private bpm(): number {
    const v = this.host.getById("global.tempo");
    return Number.isFinite(v) && v > 0 ? v : 120;
  }

  private tick(): void {
    if (!this.host.started || !this.host.ctx) return;
    const now = this.now();
    const horizon = now + LOOKAHEAD;
    const bpm = this.bpm();

    if (this.seqPlaying) {
      const s = this.settings.seq;
      const dur = divisionSeconds(s.rate, bpm);
      if (this.seqGrid < now - 0.2) this.seqGrid = now; // tab was throttled: skip, don't burst
      while (this.seqGrid < horizon) {
        const step = this.seqStep;
        const t = this.seqGrid + (step % 2 === 1 ? s.swing * 0.5 * dur : 0);
        this.fireSeqStep(step, t, dur);
        this.seqGrid += dur;
        this.seqStep = (step + 1) % Math.max(1, Math.min(SEQ_STEPS, s.length));
      }
    }

    if (this.arpGrid !== null && this.arpPattern.length > 0) {
      const a = this.settings.arp;
      const dur = divisionSeconds(a.rate, bpm);
      if (this.arpGrid < now - 0.2) this.arpGrid = now;
      while (this.arpGrid < horizon) {
        if (this.arpStep >= this.arpPattern.length) {
          this.arpStep = 0;
          if (a.mode === "random") this.rebuildArp();
        }
        const n = this.arpPattern[this.arpStep];
        const t = this.arpGrid + (this.arpStep % 2 === 1 ? a.swing * 0.5 * dur : 0);
        if (n) this.at(t, () => {
          if (this.arpGrid === null) return;
          const id = this.voiceOn(n.note, n.vel);
          this.arpIds.add(id);
          this.at(t + Math.max(0.01, dur * a.gate), () => this.voiceOff(id));
        });
        this.arpStep++;
        this.arpGrid += dur;
      }
    }
  }

  private fireSeqStep(step: number, t: number, dur: number): void {
    const s = this.settings.seq;
    const { scale } = this.settings;
    const top = this.transposeStack[this.transposeStack.length - 1];
    const transpose = s.holdTranspose && top ? top.note - 60 : 0;
    const base = s.root + transpose;
    const hits: { note: number; cell: SeqCell }[] = [];
    for (const lane of s.lanes) {
      const cell = lane.cells[step];
      if (!cell?.on || Math.random() >= cell.prob) continue;
      let note: number;
      if (s.laneMode === "degrees") note = degreeToNote(base, scale.root, scale.enabled ? scale.mask : SCALE_PRESETS[1].mask, lane.offset);
      else {
        note = base + lane.offset;
        if (scale.enabled) note = snapToScale(note, scale.root, scale.mask);
      }
      if (note >= 0 && note <= 127) hits.push({ note, cell });
    }
    this.at(t, () => {
      if (!this.seqPlaying) return;
      this.seqPos = step;
      this.seqSig.emit();
    });
    for (const { note, cell } of hits) {
      const r = Math.max(1, Math.min(4, Math.round(cell.ratchet)));
      const sub = dur / r;
      for (let k = 0; k < r; k++) {
        const on = t + k * sub;
        this.at(on, () => {
          if (!this.seqPlaying) return;
          const id = this.voiceOn(note, cell.vel);
          this.seqIds.add(id);
          this.at(on + Math.max(0.01, sub * s.gate), () => this.voiceOff(id));
        });
      }
    }
  }

  // ---- sequencer transport --------------------------------------------------
  startSeq(): void {
    if (!this.host.started || this.seqPlaying) return;
    this.seqPlaying = true;
    this.seqStep = 0;
    this.seqGrid = this.now() + 0.01;
    this.seqSig.emit();
  }
  stopSeq(): void {
    this.seqPlaying = false;
    this.seqPos = -1;
    [...this.seqIds].forEach((id) => this.voiceOff(id));
    // Transpose-held keys stay silent until re-pressed.
    this.seqSig.emit();
  }
  toggleSeq(): void {
    if (this.seqPlaying) this.stopSeq(); else this.startSeq();
  }

  // ---- arp internals ---------------------------------------------------------
  private rebuildArp(): void {
    const flat = this.arpHeld.flatMap((h) => h.notes);
    const a = this.settings.arp;
    this.arpPattern = buildArpPattern(flat, a.mode, a.octaves);
    if (this.arpPattern.length === 0) {
      this.arpGrid = null;
      this.arpStep = 0;
      [...this.arpIds].forEach((id) => this.voiceOff(id));
    } else if (this.arpGrid === null) {
      this.arpGrid = this.now();
      this.arpStep = 0;
    }
  }
  private clearArp(): void {
    this.arpHeld = [];
    this.rebuildArp();
  }

  // ---- computer keyboard ----------------------------------------------------
  private onKeyDown(e: KeyboardEvent): void {
    if (!this.midi.pcKeys) return;
    if (e.ctrlKey || e.metaKey || e.altKey || isEditable(e.target)) return;
    const off = KEY_MAP[e.code];
    if (off !== undefined) {
      e.preventDefault();
      if (e.repeat) return;
      this.noteOn(`key:${e.code}`, this.kbBase + off, this.kbVel);
      return;
    }
    if (e.repeat) return;
    if (e.code === "KeyZ") this.setKbBase(this.kbBase - 12);
    else if (e.code === "KeyX") this.setKbBase(this.kbBase + 12);
    else if (e.code === "KeyC") { this.kbVel = Math.max(0.1, +(this.kbVel - 0.1).toFixed(2)); this.settingsSig.emit(); }
    else if (e.code === "KeyV") { this.kbVel = Math.min(1, +(this.kbVel + 0.1).toFixed(2)); this.settingsSig.emit(); }
  }
  private onKeyUp(e: KeyboardEvent): void {
    if (KEY_MAP[e.code] !== undefined) this.noteOff(`key:${e.code}`);
  }

  /** Turn computer-keyboard playing on or off. */
  setPcKeys(on: boolean): void {
    if (!on) this.releaseSource("key:");
    this.setMidi({ pcKeys: on });
  }

  // ---- Web MIDI ---------------------------------------------------------------
  /**
   * Find out, without prompting, whether MIDI can be used. If the user already granted
   * access on an earlier visit, connect straight away so a plugged-in keyboard just works.
   */
  async probeMidi(): Promise<void> {
    const nav = typeof navigator !== "undefined" ? navigator : null;
    if (!nav || typeof nav.requestMIDIAccess !== "function") {
      this.setMidi({ supported: false, permission: "unsupported" });
      return;
    }
    let state: PermissionState | null = null;
    try {
      const status = await nav.permissions?.query({ name: "midi" as PermissionName });
      state = status?.state ?? null;
      if (status) {
        status.onchange = () => {
          this.setMidi({ permission: status.state });
          if (status.state === "granted") void this.enableMidi();
        };
      }
    } catch {
      state = null; // Permissions API doesn't know "midi" here; treat as needing a click.
    }
    if (this.disposed) return;
    this.setMidi({ supported: true, permission: state ?? "prompt" });
    if (state === "granted") await this.enableMidi();
  }

  async enableMidi(): Promise<void> {
    if (this.midi.enabled) return;
    const nav = typeof navigator !== "undefined" ? navigator : null;
    if (!nav || typeof nav.requestMIDIAccess !== "function") {
      this.setMidi({ supported: false, error: "Web MIDI is not supported in this browser" });
      return;
    }
    try {
      const access = await nav.requestMIDIAccess();
      if (this.disposed) return;
      this.midiAccess = access;
      access.onstatechange = () => this.bindMidiInputs();
      this.setMidi({ supported: true, enabled: true, error: null, permission: "granted" });
      this.bindMidiInputs();
    } catch (err) {
      this.setMidi({ supported: true, enabled: false, permission: "denied", error: err instanceof Error ? err.message : "MIDI access denied" });
    }
  }

  disableMidi(): void {
    const a = this.midiAccess;
    if (a) {
      a.onstatechange = null;
      a.inputs.forEach((i) => { i.onmidimessage = null; });
    }
    this.midiAccess = null;
    this.releaseSource("midi:");
    if (this.midi.enabled) this.setMidi({ enabled: false, devices: [] });
  }

  private bindMidiInputs(): void {
    const a = this.midiAccess;
    if (!a) return;
    const devices: string[] = [];
    let newest: string | null = null;
    a.inputs.forEach((input) => {
      const name = input.name ?? "MIDI input";
      const online = input.state === "connected";
      devices.push(`${name}${online ? "" : " (offline)"}`);
      // Hot-plug: a device that wasn't in the last list is announced once.
      if (online && !this.midi.devices.includes(name)) newest = name;
      input.onmidimessage = (e: MIDIMessageEvent) => { if (e.data) this.onMidi(e.data); };
    });
    this.setMidi(newest ? { devices, lastConnected: newest } : { devices });
  }

  /** Handle one raw MIDI message (exposed for tests and for hosts that deliver MIDI another way). */
  onMidi(d: Uint8Array): void {
    if (d.length < 1) return;
    const status = d[0] & 0xf0;
    const ch = (d[0] & 0x0f) + 1;
    const a = d[1] ?? 0;
    const b = d[2] ?? 0;
    let msg: string | null = null;
    if (status === 0x90 && b > 0) {
      this.noteOn(`midi:${ch}:${a}`, a, b / 127, ch);
      msg = `ch${ch} NOTE ON  ${noteName(a)} v${b}`;
    } else if (status === 0x80 || (status === 0x90 && b === 0)) {
      this.noteOff(`midi:${ch}:${a}`);
      msg = `ch${ch} NOTE OFF ${noteName(a)}`;
    } else if (status === 0xb0) {
      if (a === 1) this.controller("modwheel", b / 127);
      else if (a === 123 || a === 120) this.allOff();
      msg = `ch${ch} CC${a} = ${b}`;
    } else if (status === 0xd0) {
      this.controller("aftertouch", a / 127);
      msg = `ch${ch} AFTERTOUCH ${a}`;
    } else if (status === 0xa0) {
      this.controller("aftertouch", b / 127);
      msg = `ch${ch} POLY AT ${noteName(a)} ${b}`;
    } else if (status === 0xe0) {
      const v = ((b << 7) | a) - 8192;
      this.controller("pitchBend", Math.max(-1, v / 8192));
      msg = `ch${ch} PITCH BEND ${v}`;
    }
    if (msg) this.setMidi({ monitor: [msg, ...this.midi.monitor].slice(0, 12) });
  }

  private setMidi(patch: Partial<MidiState>): void {
    this.midi = { ...this.midi, ...patch };
    this.midiSig.emit();
  }
}
