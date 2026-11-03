/**
 * INSANITY perf — pure-logic checks: Scala parser, tuning maths, scale snap,
 * arp ordering, MIDI matrix, and the engine's input → voice-id bookkeeping.
 *
 * Run: node --import tsx src/lib/insanity/perf/__tests__/perf.test.ts
 */

import assert from "node:assert/strict";
import type { InsanityHost } from "../../host";
import { PerformanceEngine } from "../engine";
import { DEFAULT_MATRIX, SCALE_PRESETS, applyMatrix, buildArpPattern, degreeToNote, learnChord, snapToScale } from "../theory";
import { ScalaError, TUNING_PRESETS, TWELVE_TET, edo, noteToHz, parseScala, toScala } from "../tuning";

let passed = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
  } catch (e) {
    console.error(`FAIL: ${name}`);
    throw e;
  }
}
const near = (a: number, b: number, tol: number, msg: string): void => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

// ---- Scala ------------------------------------------------------------------
test("scala: cents, ratios, integers, comments, trailing text", () => {
  const t = parseScala([
    "! meanquar.scl",
    "!",
    "1/4-comma meantone scale. Pietro Aaron's temperament (1523)",
    " 4",
    "!",
    " 76.04900 first",
    " 5/4",
    "  3/2   fifth, ignored text",
    " 2",
  ].join("\r\n"));
  assert.equal(t.description, "1/4-comma meantone scale. Pietro Aaron's temperament (1523)");
  assert.equal(t.cents.length, 4);
  near(t.cents[0], 76.049, 1e-9, "cents line");
  near(t.cents[1], 386.3137, 1e-3, "5/4");
  near(t.cents[2], 701.955, 1e-3, "3/2");
  near(t.cents[3], 1200, 1e-9, "bare integer 2 = 2/1");
});

test("scala: empty description line is allowed", () => {
  const t = parseScala("!x\n\n1\n2/1\n");
  assert.equal(t.description, "");
  assert.deepEqual(t.cents, [1200]);
});

test("scala: errors", () => {
  assert.throws(() => parseScala("desc\n3\n100.0\n200.0\n"), ScalaError);
  assert.throws(() => parseScala("desc\nabc\n"), ScalaError);
  assert.throws(() => parseScala("desc\n1\n3/0\n"), ScalaError);
  assert.throws(() => parseScala("desc\n1\nfoo\n"), ScalaError);
});

test("scala: round-trip through toScala", () => {
  for (const p of TUNING_PRESETS) {
    const back = parseScala(toScala(p));
    assert.equal(back.cents.length, p.cents.length);
    back.cents.forEach((c, i) => near(c, p.cents[i], 1e-5, `${p.name} deg ${i + 1}`));
  }
});

// ---- tuning maths ------------------------------------------------------------
test("12-TET reproduces equal temperament at any reference", () => {
  near(noteToHz(TWELVE_TET, 69), 440, 1e-9, "A4");
  near(noteToHz(TWELVE_TET, 60), 261.6256, 1e-3, "C4");
  near(noteToHz(TWELVE_TET, 21), 27.5, 1e-9, "A0");
  near(noteToHz(TWELVE_TET, 69, 432), 432, 1e-9, "A4 @432");
});

test("EDO / BP: one key = one step from middle C", () => {
  const e19 = edo(19);
  near(noteToHz(e19, 60 + 19), noteToHz(e19, 60) * 2, 1e-9, "19 keys = octave");
  const bp = TUNING_PRESETS.find((t) => t.name === "Bohlen-Pierce");
  assert.ok(bp);
  near(noteToHz(bp, 60 + 13), noteToHz(bp, 60) * 3, 1e-9, "13 keys = tritave");
  near(noteToHz(bp, 60 - 13), noteToHz(bp, 60) / 3, 1e-9, "below root");
});

test("Just intonation fifth is 3/2", () => {
  const ji = TUNING_PRESETS.find((t) => t.name === "Just Intonation");
  assert.ok(ji);
  near(noteToHz(ji, 67) / noteToHz(ji, 60), 1.5, 1e-9, "fifth");
});

// ---- scales ---------------------------------------------------------------------
const MAJOR = SCALE_PRESETS.find((s) => s.name === "Major")!.mask;
test("scale snap to C major (ties down)", () => {
  assert.equal(snapToScale(60, 0, MAJOR), 60);
  assert.equal(snapToScale(61, 0, MAJOR), 60); // C# → C (tie, down)
  assert.equal(snapToScale(66, 0, MAJOR), 65); // F# → F
  assert.equal(snapToScale(70, 0, MAJOR), 69); // A# → A
  assert.equal(snapToScale(61, 2, MAJOR), 61); // D major: C# is in
  assert.equal(snapToScale(61, 0, Array(12).fill(false)), 61); // empty mask passes
});

test("degreeToNote walks the scale", () => {
  assert.equal(degreeToNote(60, 0, MAJOR, 0), 60);
  assert.equal(degreeToNote(60, 0, MAJOR, 2), 64);
  assert.equal(degreeToNote(60, 0, MAJOR, 7), 72);
  assert.equal(degreeToNote(60, 0, MAJOR, -1), 59);
});

test("learnChord is relative to the lowest note", () => {
  assert.deepEqual(learnChord([67, 60, 64, 72, 64]), [0, 4, 7, 12]);
});

// ---- arp ordering ----------------------------------------------------------------
const held = [64, 60, 67].map((note) => ({ note, vel: 1 }));
const notes = (m: Parameters<typeof buildArpPattern>[1], o = 1): number[] => buildArpPattern(held, m, o).map((n) => n.note);
test("arp orders", () => {
  assert.deepEqual(notes("up"), [60, 64, 67]);
  assert.deepEqual(notes("down"), [67, 64, 60]);
  assert.deepEqual(notes("updown"), [60, 64, 67, 64]);
  assert.deepEqual(notes("downup"), [67, 64, 60, 64]);
  assert.deepEqual(notes("asPlayed"), [64, 60, 67]);
  assert.deepEqual(notes("off"), []);
  assert.deepEqual(notes("up", 2), [60, 64, 67, 72, 76, 79]);
  assert.deepEqual(notes("down", 2), [79, 76, 72, 67, 64, 60]);
  assert.deepEqual([...notes("random")].sort(), [60, 64, 67]);
  assert.deepEqual(buildArpPattern(held.slice(0, 2), "updown", 1).map((n) => n.note), [60, 64]);
});

// ---- matrix ---------------------------------------------------------------------
test("matrix: transpose, range, channel, curves", () => {
  const m = { ...DEFAULT_MATRIX, transpose: 2, octave: 1 };
  assert.equal(applyMatrix(m, 60, 0.5, 0)?.note, 74);
  assert.equal(applyMatrix({ ...DEFAULT_MATRIX, lowNote: 61 }, 60, 0.5, 0), null);
  assert.equal(applyMatrix({ ...DEFAULT_MATRIX, channel: 2 }, 60, 0.5, 1), null);
  assert.ok(applyMatrix({ ...DEFAULT_MATRIX, channel: 2 }, 60, 0.5, 2));
  near(applyMatrix({ ...DEFAULT_MATRIX, velCurve: "hard" }, 60, 0.5, 0)!.vel, 0.25, 1e-9, "hard");
  near(applyMatrix({ ...DEFAULT_MATRIX, velCurve: "fixed", fixedVel: 0.3 }, 60, 1, 0)!.vel, 0.3, 1e-9, "fixed");
});

// ---- engine bookkeeping (fake host) -----------------------------------------------
function fakeHost() {
  const on = new Map<number, { freq: number; note: number; vel: number }>();
  let next = 1;
  const host = {
    started: true,
    ctx: { currentTime: 0 },
    newNoteId: () => next++,
    noteOn: (id: number, freq: number, note: number, vel: number) => { on.set(id, { freq, note, vel }); },
    noteOff: (id: number) => { on.delete(id); },
    allNotesOff: () => on.clear(),
    controller: () => {},
    getById: () => 120,
    onStarted: () => () => {},
  };
  return { host: host as unknown as InsanityHost, on };
}

test("engine: chord key releases exactly its voices", () => {
  const { host, on } = fakeHost();
  const e = new PerformanceEngine(host);
  e.update("chord", { enabled: true, active: 0 }); // maj
  e.noteOn("a", 60, 1);
  e.noteOn("b", 65, 1);
  assert.equal(on.size, 6);
  const freqs = [...on.values()].map((v) => Math.round(v.note));
  assert.deepEqual(freqs.slice(0, 3), [60, 64, 67]);
  e.noteOff("a");
  assert.equal(on.size, 3);
  assert.ok(!e.isSounding(60) && e.isSounding(65));
  e.noteOff("b");
  assert.equal(on.size, 0);
});

test("engine: scale snap dedupes and arp swallows direct notes", () => {
  const { host, on } = fakeHost();
  const e = new PerformanceEngine(host);
  e.update("scale", { enabled: true });
  e.noteOn("a", 61, 1); // → C
  assert.deepEqual([...on.values()].map((v) => Math.round(v.note)), [60]);
  e.noteOff("a");
  e.update("arp", { mode: "up" });
  e.noteOn("b", 60, 1);
  assert.equal(on.size, 0, "arp notes are clocked, not immediate");
  e.dispose();
});

test("engine: not started = no-op", () => {
  const { host, on } = fakeHost();
  (host as { started: boolean }).started = false;
  const e = new PerformanceEngine(host);
  e.noteOn("a", 60, 1);
  e.onMidi(new Uint8Array([0x90, 62, 100]));
  e.startSeq();
  assert.equal(on.size, 0);
  assert.equal(e.seqPlaying, false);
  assert.ok(e.isPressed(60), "key still lights");
  e.noteOff("a");
  assert.ok(!e.isPressed(60));
});

test("engine: MIDI note on / velocity-0 off / pitch bend", () => {
  const { host, on } = fakeHost();
  const e = new PerformanceEngine(host);
  e.onMidi(new Uint8Array([0x91, 62, 127]));
  assert.equal(on.size, 1);
  e.onMidi(new Uint8Array([0x91, 62, 0]));
  assert.equal(on.size, 0);
  e.onMidi(new Uint8Array([0xe0, 0, 0]));
  near(e.pitchBend, -1, 1e-9, "bend min");
  e.onMidi(new Uint8Array([0xe0, 0x7f, 0x7f]));
  near(e.pitchBend, 8191 / 8192, 1e-9, "bend max");
  assert.equal(e.midi.monitor.length, 4);
});

console.log(`perf tests: ${passed} passed`);
