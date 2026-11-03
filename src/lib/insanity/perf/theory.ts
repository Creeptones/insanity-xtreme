// INSANITY perf — the pure note maths: MIDI matrix, scales, chords, arp ordering,
// tempo divisions. No DOM, no host.

// ---- MIDI matrix -------------------------------------------------------------
export const VEL_CURVES = ["linear", "soft", "hard", "fixed"] as const;
export type VelCurve = (typeof VEL_CURVES)[number];

export interface MatrixSettings {
  transpose: number; // semitones -24..24
  octave: number; // -3..3
  velCurve: VelCurve;
  velScale: number; // 0..2
  fixedVel: number; // 0..1
  /** 0 = omni, 1..16 = only that MIDI channel. */
  channel: number;
  lowNote: number;
  highNote: number;
}

export const DEFAULT_MATRIX: MatrixSettings = {
  transpose: 0, octave: 0, velCurve: "linear", velScale: 1, fixedVel: 0.8, channel: 0, lowNote: 0, highNote: 127,
};

/** vel in 0..1. Returns null when the event is filtered out. Channel 0 = untagged (on-screen / keys). */
export function applyMatrix(m: MatrixSettings, note: number, vel: number, channel: number): { note: number; vel: number } | null {
  if (m.channel !== 0 && channel !== 0 && channel !== m.channel) return null;
  if (note < m.lowNote || note > m.highNote) return null;
  const out = note + m.transpose + 12 * m.octave;
  if (out < 0 || out > 127) return null;
  let v = Math.max(0, Math.min(1, vel));
  switch (m.velCurve) {
    case "soft": v = Math.sqrt(v); break;
    case "hard": v = v * v; break;
    case "fixed": v = m.fixedVel; break;
    default: break;
  }
  v = Math.max(0.01, Math.min(1, v * m.velScale));
  return { note: out, vel: v };
}

// ---- scales -----------------------------------------------------------------
export type ScaleMask = readonly boolean[]; // length 12, index = semitone above root

function mask(...semis: number[]): boolean[] {
  return Array.from({ length: 12 }, (_, i) => semis.includes(i));
}

export const SCALE_PRESETS: readonly { name: string; mask: boolean[] }[] = [
  { name: "Chromatic", mask: mask(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11) },
  { name: "Major", mask: mask(0, 2, 4, 5, 7, 9, 11) },
  { name: "Minor", mask: mask(0, 2, 3, 5, 7, 8, 10) },
  { name: "Dorian", mask: mask(0, 2, 3, 5, 7, 9, 10) },
  { name: "Phrygian", mask: mask(0, 1, 3, 5, 7, 8, 10) },
  { name: "Lydian", mask: mask(0, 2, 4, 6, 7, 9, 11) },
  { name: "Mixolydian", mask: mask(0, 2, 4, 5, 7, 9, 10) },
  { name: "Locrian", mask: mask(0, 1, 3, 5, 6, 8, 10) },
  { name: "Harmonic Minor", mask: mask(0, 2, 3, 5, 7, 8, 11) },
  { name: "Melodic Minor", mask: mask(0, 2, 3, 5, 7, 9, 11) },
  { name: "Major Pentatonic", mask: mask(0, 2, 4, 7, 9) },
  { name: "Minor Pentatonic", mask: mask(0, 3, 5, 7, 10) },
  { name: "Blues", mask: mask(0, 3, 5, 6, 7, 10) },
  { name: "Whole Tone", mask: mask(0, 2, 4, 6, 8, 10) },
  { name: "Diminished", mask: mask(0, 2, 3, 5, 6, 8, 9, 11) },
  { name: "Hirajoshi", mask: mask(0, 2, 3, 7, 8) },
  { name: "Just The Root (Bold)", mask: mask(0) },
];

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
export function noteName(n: number): string {
  return `${NOTE_NAMES[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`;
}

function inMask(m: ScaleMask, root: number, note: number): boolean {
  return m[(((note - root) % 12) + 12) % 12] === true;
}

/** Nearest in-scale note (ties snap down). An empty mask passes notes through. */
export function snapToScale(note: number, root: number, m: ScaleMask): number {
  if (!m.some(Boolean)) return note;
  for (let d = 0; d <= 6; d++) {
    if (inMask(m, root, note - d)) return note - d;
    if (inMask(m, root, note + d)) return note + d;
  }
  return note;
}

/** The `degree`-th scale note above (or below, if negative) `base`, where base counts as degree 0 after snapping. */
export function degreeToNote(base: number, root: number, m: ScaleMask, degree: number): number {
  if (!m.some(Boolean)) return base + degree;
  let n = snapToScale(base, root, m);
  const dir = degree < 0 ? -1 : 1;
  for (let k = 0; k < Math.abs(degree); k++) {
    do n += dir; while (!inMask(m, root, n));
  }
  return n;
}

// ---- chords -----------------------------------------------------------------
export interface ChordSlot {
  name: string;
  /** Semitones above the played key. 0 is the key itself. */
  intervals: number[];
}

export const CHORD_PRESETS: readonly ChordSlot[] = [
  { name: "maj", intervals: [0, 4, 7] },
  { name: "min", intervals: [0, 3, 7] },
  { name: "7", intervals: [0, 4, 7, 10] },
  { name: "maj7", intervals: [0, 4, 7, 11] },
  { name: "min7", intervals: [0, 3, 7, 10] },
  { name: "maj9", intervals: [0, 4, 7, 11, 14] },
  { name: "min9", intervals: [0, 3, 7, 10, 14] },
  { name: "sus2", intervals: [0, 2, 7] },
  { name: "sus4", intervals: [0, 5, 7] },
  { name: "dim", intervals: [0, 3, 6] },
  { name: "aug", intervals: [0, 4, 8] },
  { name: "power", intervals: [0, 7, 12] },
  { name: "6/9", intervals: [0, 4, 7, 9, 14] },
  { name: "quartal", intervals: [0, 5, 10, 15] },
  { name: "cluster", intervals: [0, 1, 2, 3] },
  { name: "every note", intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
];

/** Intervals relative to the lowest of `notes` (deduped, sorted). */
export function learnChord(notes: readonly number[]): number[] {
  if (notes.length === 0) return [0];
  const lo = Math.min(...notes);
  return [...new Set(notes.map((n) => n - lo))].sort((a, b) => a - b);
}

// ---- arpeggiator ------------------------------------------------------------
export const ARP_MODES = ["off", "up", "down", "updown", "downup", "random", "asPlayed"] as const;
export type ArpMode = (typeof ARP_MODES)[number];

export interface ArpNote {
  note: number;
  vel: number;
}

/**
 * One full arp cycle. `held` is in press order. Ported from ArpeggiatorProcessor.cpp:
 * up/updown sort ascending, down/downup descending; updown/downup skip the turnaround
 * endpoints when more than two notes; each octave repeats the pattern 12 semitones up
 * (down / downup start from the top octave so they keep falling).
 */
export function buildArpPattern(held: readonly ArpNote[], mode: ArpMode, octaves: number, rand: () => number = Math.random): ArpNote[] {
  if (mode === "off" || held.length === 0) return [];
  const asc = [...held].sort((a, b) => a.note - b.note);
  let base: ArpNote[];
  switch (mode) {
    case "up": base = asc; break;
    case "down": base = [...asc].reverse(); break;
    case "updown": base = asc.length > 2 ? [...asc, ...asc.slice(1, -1).reverse()] : asc; break;
    case "downup": {
      const desc = [...asc].reverse();
      base = desc.length > 2 ? [...desc, ...desc.slice(1, -1).reverse()] : desc;
      break;
    }
    case "random": {
      base = [...held];
      for (let i = base.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [base[i], base[j]] = [base[j], base[i]];
      }
      break;
    }
    default: base = [...held];
  }
  const oct = Math.max(1, Math.min(4, Math.round(octaves)));
  const falling = mode === "down" || mode === "downup";
  const out: ArpNote[] = [];
  for (let o = 0; o < oct; o++) {
    const shift = 12 * (falling ? oct - 1 - o : o);
    for (const n of base) out.push({ note: n.note + shift, vel: n.vel });
  }
  return out.filter((n) => n.note >= 0 && n.note <= 127);
}

// ---- tempo divisions ----------------------------------------------------------
export const DIVISIONS = ["1/4", "1/8", "1/8T", "1/16", "1/16T", "1/32"] as const;
export type Division = (typeof DIVISIONS)[number];
const DIV_BEATS: Record<Division, number> = { "1/4": 1, "1/8": 0.5, "1/8T": 1 / 3, "1/16": 0.25, "1/16T": 1 / 6, "1/32": 0.125 };

/** Seconds per step. */
export function divisionSeconds(div: Division, bpm: number): number {
  return (60 / Math.max(1, bpm)) * DIV_BEATS[div];
}
