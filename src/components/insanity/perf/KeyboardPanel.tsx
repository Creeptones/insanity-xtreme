"use client";

// INSANITY perf — on-screen piano (4 octaves), mod wheel, pitch bend, octave shift.
// Keys light for every sounding note (keyboard, MIDI, chords, arp, sequencer).
// Pointer input: vertical position on a key sets velocity; dragging glisses; multi-touch works.

import { useCallback, useRef, type PointerEvent } from "react";
import { cn } from "@/lib/cn";
import { noteName } from "@/lib/insanity/perf/theory";
import { Section } from "../InsanityPrimitives";
import { usePerf, usePerfSettings, useSignal } from "./PerformanceContext";
import { Label, isBlack } from "./perfUi";

const OCTAVES = 4;

function noteAt(x: number, y: number): { note: number; vel: number } | null {
  const el = document.elementFromPoint(x, y);
  const key = el instanceof HTMLElement ? el.closest<HTMLElement>("[data-note]") : null;
  if (!key) return null;
  const r = key.getBoundingClientRect();
  const vel = Math.max(0.15, Math.min(1, (y - r.top) / Math.max(1, r.height)));
  return { note: Number(key.dataset.note), vel };
}

function Piano(): JSX.Element {
  const perf = usePerf();
  usePerfSettings();
  useSignal(perf.notesSig);
  const first = perf.kbBase - 12;
  const notes = Array.from({ length: OCTAVES * 12 + 1 }, (_, i) => first + i);
  const whites = notes.filter((n) => !isBlack(n));
  const active = useRef(new Map<number, number>()); // pointerId → note

  const press = useCallback((pid: number, x: number, y: number) => {
    const hit = noteAt(x, y);
    const cur = active.current.get(pid);
    if (hit?.note === cur) return;
    const key = `scr:${pid}`;
    if (cur !== undefined) perf.noteOff(key);
    if (hit) {
      active.current.set(pid, hit.note);
      perf.noteOn(key, hit.note, hit.vel);
    } else active.current.delete(pid);
  }, [perf]);
  const release = useCallback((pid: number) => {
    if (active.current.has(pid)) perf.noteOff(`scr:${pid}`);
    active.current.delete(pid);
  }, [perf]);

  const onDown = (e: PointerEvent<HTMLDivElement>): void => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    press(e.pointerId, e.clientX, e.clientY);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>): void => {
    if (active.current.has(e.pointerId)) press(e.pointerId, e.clientX, e.clientY);
  };
  const onUp = (e: PointerEvent<HTMLDivElement>): void => release(e.pointerId);

  const color = (n: number): string | undefined =>
    perf.isSounding(n) ? "#4ade80" : perf.isPressed(n) ? "#f59e0b" : undefined;

  return (
    <div
      className="relative h-16 w-full touch-none select-none"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      role="group"
      aria-label="Piano keyboard"
    >
      <div className="flex h-full">
        {whites.map((n) => (
          <div key={n} data-note={n} title={noteName(n)}
            className={cn("relative h-full flex-1 rounded-b-[2px] border border-zinc-700", n === perf.kbBase && "after:absolute after:bottom-0.5 after:left-1/2 after:h-1 after:w-1 after:-translate-x-1/2 after:rounded-full after:bg-violet-500")}
            style={{ background: color(n) ?? "linear-gradient(#f4f4f5,#d4d4d8)" }} />
        ))}
      </div>
      {notes.filter(isBlack).map((n) => {
        const whiteIndex = whites.filter((w) => w < n).length; // white keys to the left
        return (
          <div key={n} data-note={n} title={noteName(n)}
            className="absolute top-0 h-[60%] rounded-b-[2px] border border-black"
            style={{ left: `calc(${(whiteIndex / whites.length) * 100}% - ${35 / whites.length}%)`, width: `${70 / whites.length}%`, background: color(n) ?? "linear-gradient(#3f3f46,#09090b)" }} />
        );
      })}
    </div>
  );
}

/** Vertical controller strip. `spring` returns to the centre on release (pitch bend). */
function Strip({ label, value, min, onChange, spring }: { label: string; value: number; min: number; onChange: (v: number) => void; spring?: boolean }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const set = (clientY: number): void => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const n = 1 - Math.max(0, Math.min(1, (clientY - r.top) / r.height));
    onChange(min + n * (1 - min));
  };
  const norm = (value - min) / (1 - min);
  return (
    <div className="flex flex-col items-center gap-0.5">
      <Label>{label}</Label>
      <div
        ref={ref}
        role="slider"
        aria-label={label}
        aria-valuenow={Math.round(value * 100)}
        aria-valuemin={Math.round(min * 100)}
        aria-valuemax={100}
        className="relative h-12 w-4 cursor-ns-resize touch-none rounded-[2px] border border-zinc-700 bg-zinc-950"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); set(e.clientY); }}
        onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) set(e.clientY); }}
        onPointerUp={() => { if (spring) onChange(0); }}
        onPointerCancel={() => { if (spring) onChange(0); }}
      >
        {min < 0 ? <div className="absolute inset-x-0 top-1/2 h-px bg-zinc-700" /> : (
          <div className="absolute inset-x-0 bottom-0 bg-violet-600/60" style={{ height: `${norm * 100}%` }} />
        )}
        <div className="absolute inset-x-0 h-1.5 -translate-y-1/2 rounded-[1px] bg-zinc-300" style={{ top: `${(1 - norm) * 100}%` }} />
      </div>
    </div>
  );
}

function Controllers(): JSX.Element {
  const perf = usePerf();
  useSignal(perf.ctrlSig);
  return (
    <div className="flex gap-1">
      <Strip label="Bend" value={perf.pitchBend} min={-1} spring onChange={(v) => perf.controller("pitchBend", v)} />
      <Strip label="Mod" value={perf.modwheel} min={0} onChange={(v) => perf.controller("modwheel", v)} />
    </div>
  );
}

export function KeyboardPanel(): JSX.Element {
  const perf = usePerf();
  usePerfSettings();
  return (
    <Section title="Keyboard" badge="(88 keys of attitude)">
      <div className="flex items-stretch gap-1.5">
        <Controllers />
        <div className="min-w-0 flex-1"><Piano /></div>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <button type="button" className="rounded-[2px] border border-zinc-700 bg-zinc-800 px-1.5 text-[9px] font-bold text-zinc-200 hover:bg-zinc-700" onClick={() => perf.setKbBase(perf.kbBase - 12)}>OCT −</button>
        <span className="font-mono text-[9px] text-zinc-300">{noteName(perf.kbBase)}</span>
        <button type="button" className="rounded-[2px] border border-zinc-700 bg-zinc-800 px-1.5 text-[9px] font-bold text-zinc-200 hover:bg-zinc-700" onClick={() => perf.setKbBase(perf.kbBase + 12)}>OCT +</button>
        <Label className="ml-1">vel {Math.round(perf.kbVel * 127)}</Label>
        <Label className="ml-auto normal-case">keys: A W S E D F T G Y H U J K O L P ; &apos; · Z/X octave · C/V velocity</Label>
      </div>
    </Section>
  );
}
