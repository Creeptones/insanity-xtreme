// INSANITY perf — tuning: MIDI note → Hz.
//
// A tuning is a list of scale degrees in cents, exactly like a Scala .scl file:
// degree 0 (1/1) is implicit, the LAST entry is the period (usually 1200 = 2/1).
// Degree 0 sits on MIDI ROOT_NOTE (60, middle C) and its frequency is the 12-TET C
// implied by the reference A4, so 12-TET reproduces A4 = refHz exactly.
// Each MIDI key is one scale step, so a 19-EDO tuning spreads 19 keys per period.
//
// Pure TS, no DOM.

export interface Tuning {
  name: string;
  description: string;
  /** Scale degrees 1..n in cents. The last is the period. Length >= 1. */
  cents: number[];
}

export const ROOT_NOTE = 60;
export const DEFAULT_REF_HZ = 440;

export function ratioToCents(r: number): number {
  return 1200 * Math.log2(r);
}

export function edo(n: number, period = 1200, name = `${n}-EDO`): Tuning {
  const step = period / n;
  return {
    name,
    description: `${n} equal divisions of ${period === 1200 ? "the octave" : `${period.toFixed(2)} cents`}`,
    cents: Array.from({ length: n }, (_, i) => step * (i + 1)),
  };
}

function fromRatios(name: string, description: string, ratios: [number, number][]): Tuning {
  return { name, description, cents: ratios.map(([a, b]) => ratioToCents(a / b)) };
}

export const TWELVE_TET = edo(12, 1200, "12-TET");

export const TUNING_PRESETS: readonly Tuning[] = [
  TWELVE_TET,
  edo(19),
  edo(22),
  edo(24),
  edo(31),
  edo(53),
  fromRatios("Just Intonation", "5-limit just intonation (Ptolemy-ish) on C", [
    [16, 15], [9, 8], [6, 5], [5, 4], [4, 3], [45, 32], [3, 2], [8, 5], [5, 3], [9, 5], [15, 8], [2, 1],
  ]),
  fromRatios("Pythagorean", "Pure 3:2 fifths stacked from C", [
    [256, 243], [9, 8], [32, 27], [81, 64], [4, 3], [729, 512], [3, 2], [128, 81], [27, 16], [16, 9], [243, 128], [2, 1],
  ]),
  edo(13, ratioToCents(3), "Bohlen-Pierce"),
];

/** Frequency of an integer (or fractional, linearly interpolated in cents) MIDI note. */
export function noteToHz(t: Tuning, note: number, refHz = DEFAULT_REF_HZ): number {
  const rootHz = refHz * Math.pow(2, (ROOT_NOTE - 69) / 12);
  const lo = Math.floor(note);
  const frac = note - lo;
  const c = degreeCents(t, lo - ROOT_NOTE);
  const c2 = frac > 0 ? degreeCents(t, lo + 1 - ROOT_NOTE) : c;
  return rootHz * Math.pow(2, (c + (c2 - c) * frac) / 1200);
}

/** Cents above the root for a signed degree index. */
export function degreeCents(t: Tuning, d: number): number {
  const n = t.cents.length;
  const period = t.cents[n - 1];
  const oct = Math.floor(d / n);
  const deg = d - oct * n;
  return oct * period + (deg === 0 ? 0 : t.cents[deg - 1]);
}

/** Fractional MIDI note for the frequency (what host.noteOn wants as `note`). */
export function hzToNote(hz: number, refHz = DEFAULT_REF_HZ): number {
  return 69 + 12 * Math.log2(hz / refHz);
}

// ---- Scala .scl ------------------------------------------------------------
// Spec (huygens-fokker.org/scala/scl_format.html): lines starting with '!' are
// comments. First non-comment line: description (may be empty). Second: number of
// notes. Then one pitch per line: a value containing '.' is cents, otherwise a ratio
// "a/b" or a bare integer "a" (= a/1). Anything after the value on a line is ignored.

export class ScalaError extends Error {}

export function parseScala(text: string, fallbackName = "Scala"): Tuning {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  let description: string | null = null;
  let count = -1;
  const cents: number[] = [];
  for (const raw of lines) {
    if (raw.startsWith("!")) continue;
    if (description === null) {
      description = raw.trim();
      continue;
    }
    const line = raw.trim();
    if (count < 0) {
      if (line === "") continue;
      const m = /^(\d+)/.exec(line);
      if (!m) throw new ScalaError(`Bad note count: "${line}"`);
      count = Number(m[1]);
      continue;
    }
    if (cents.length >= count) break;
    if (line === "") continue;
    cents.push(parsePitch(line.split(/\s+/)[0]));
  }
  if (description === null || count < 0) throw new ScalaError("Missing description or note count");
  if (cents.length < count) throw new ScalaError(`Expected ${count} pitches, found ${cents.length}`);
  if (count === 0) throw new ScalaError("Scale has no notes");
  if (!(cents[count - 1] > 0)) throw new ScalaError("Period (last pitch) must be above 1/1");
  return { name: fallbackName, description, cents };
}

function parsePitch(tok: string): number {
  if (tok.includes(".")) {
    const v = Number(tok);
    if (!Number.isFinite(v)) throw new ScalaError(`Bad cents value: "${tok}"`);
    return v;
  }
  const m = /^(\d+)(?:\/(\d+))?$/.exec(tok);
  if (!m) throw new ScalaError(`Bad ratio: "${tok}"`);
  const a = Number(m[1]);
  const b = m[2] === undefined ? 1 : Number(m[2]);
  if (a <= 0 || b <= 0) throw new ScalaError(`Ratio must be positive: "${tok}"`);
  return ratioToCents(a / b);
}

/** Serialise as .scl (cents lines, 6 decimals). */
export function toScala(t: Tuning): string {
  const head = `! ${t.name.replace(/[^\w.-]+/g, "_")}.scl\n!\n${t.description || t.name}\n ${t.cents.length}\n!\n`;
  return head + t.cents.map((c) => ` ${c.toFixed(6)}`).join("\n") + "\n";
}
