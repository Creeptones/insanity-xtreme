"use client";

// INSANITY perf — CHORD MEMORY (256x, allegedly). 16 slots; when enabled, every key
// plays the active slot's chord built on that key. Slots take a preset or LEARN the
// notes currently held. Strum spreads the chord notes over time.

import { useState } from "react";
import { cn } from "@/lib/cn";
import { CHORD_PRESETS } from "@/lib/insanity/perf/theory";
import { ACCENTS, RawKnob } from "../InsanityKnob";
import { Section } from "../InsanityPrimitives";
import { usePerf, usePerfSettings } from "./PerformanceContext";
import { Label, LitButton, MiniSelect } from "./perfUi";

const PRESET_NAMES = CHORD_PRESETS.map((c) => c.name);
const SELECT_NAMES = [...PRESET_NAMES, "learned"];

export function ChordMemoryPanel(): JSX.Element {
  const perf = usePerf();
  const { chord } = usePerfSettings();
  const [flash, setFlash] = useState<string | null>(null);
  const active = chord.slots[chord.active];
  const learn = (): void => {
    const ok = perf.learnChord();
    setFlash(ok ? "learned!" : "hold some keys first");
    setTimeout(() => setFlash(null), 1200);
  };
  return (
    <Section title="Chord Memory" badge="(256x)">
      <div className="flex flex-wrap items-end gap-1">
        <LitButton on={chord.enabled} onClick={() => perf.update("chord", { enabled: !chord.enabled })} title="Each key plays the active chord">
          {chord.enabled ? "Chords on" : "Chords off"}
        </LitButton>
        <MiniSelect
          label={`Slot ${chord.active + 1}`}
          value={PRESET_NAMES.includes(active?.name ?? "") ? active.name : "learned"}
          options={SELECT_NAMES}
          onChange={(name) => {
            const p = CHORD_PRESETS.find((c) => c.name === name);
            if (!p) return;
            perf.update("chord", { slots: chord.slots.map((s, i) => (i === chord.active ? { name: p.name, intervals: [...p.intervals] } : s)) });
          }}
        />
        <LitButton on={false} onClick={learn} color="#f59e0b" title="Store the held notes in this slot">Learn</LitButton>
        <RawKnob label="Strum" value={chord.strumMs} min={0} max={250} defaultValue={0} color={ACCENTS[4]} onChange={(v) => perf.update("chord", { strumMs: v })} format={(v) => `${Math.round(v)}ms`} />
        {flash ? <Label className="text-amber-400">{flash}</Label> : null}
      </div>
      <div className="mt-1 grid grid-cols-8 gap-[2px]">
        {chord.slots.map((s, i) => (
          <button
            key={i}
            type="button"
            onClick={() => perf.update("chord", { active: i })}
            aria-pressed={i === chord.active}
            title={`${s.name}: ${s.intervals.join(" ")}`}
            className={cn("flex h-7 flex-col items-center justify-center rounded-[1px] border text-[7px] uppercase leading-tight",
              i === chord.active ? "border-black bg-emerald-400 text-black shadow-[0_0_6px_#4ade80]" : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:bg-zinc-800")}
          >
            <span className="font-bold">{i + 1}</span>
            <span className="w-full truncate px-0.5 text-center">{s.name}</span>
          </button>
        ))}
      </div>
      <div className="mt-1 font-mono text-[8px] text-zinc-500">intervals: {active?.intervals.join(" · ")}</div>
    </Section>
  );
}
