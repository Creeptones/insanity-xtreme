"use client";

// INSANITY perf — SCALE EDITOR: 12 pitch-class toggles relative to the root, presets,
// and a little piano. When enabled, every played / chord / arp note snaps to the scale
// (nearest in-scale note, ties snap down). Sequencer lanes in "degrees" mode walk it.

import { cn } from "@/lib/cn";
import { NOTE_NAMES, SCALE_PRESETS } from "@/lib/insanity/perf/theory";
import { Section } from "../InsanityPrimitives";
import { usePerf, usePerfSettings } from "./PerformanceContext";
import { LitButton, MiniPiano, MiniSelect } from "./perfUi";

const ROOTS = Array.from({ length: 12 }, (_, i) => i);
const PRESET_NAMES = [...SCALE_PRESETS.map((p) => p.name), "Custom"];

export function ScaleEditorPanel(): JSX.Element {
  const perf = usePerf();
  const { scale } = usePerfSettings();
  const toggle = (deg: number): void => {
    if (deg === 0) return; // the root always stays in
    const mask = scale.mask.map((on, i) => (i === deg ? !on : on));
    perf.update("scale", { mask, preset: "Custom" });
  };
  const pcLit = (pc: number): string | null => {
    const deg = (pc - scale.root + 12) % 12;
    if (!scale.mask[deg]) return null;
    return deg === 0 ? "#a855f7" : scale.enabled ? "#4ade80" : "#3f6b4f";
  };
  return (
    <Section title="Scale Editor">
      <div className="flex flex-wrap items-end gap-1">
        <LitButton on={scale.enabled} onClick={() => perf.update("scale", { enabled: !scale.enabled })} title="Snap every note to the scale">
          {scale.enabled ? "Snap on" : "Snap off"}
        </LitButton>
        <MiniSelect label="Root" value={scale.root} options={ROOTS} format={(v) => NOTE_NAMES[v]} onChange={(v) => perf.update("scale", { root: v })} />
        <MiniSelect
          label="Scale"
          value={scale.preset}
          options={PRESET_NAMES}
          onChange={(name) => {
            const p = SCALE_PRESETS.find((s) => s.name === name);
            if (p) perf.update("scale", { mask: [...p.mask], preset: p.name });
          }}
        />
      </div>
      <div className="mt-1 grid grid-cols-12 gap-[2px]">
        {scale.mask.map((on, deg) => (
          <button
            key={deg}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(deg)}
            title={deg === 0 ? "Root (always on)" : `Toggle ${NOTE_NAMES[(scale.root + deg) % 12]}`}
            className={cn("flex h-8 flex-col items-center justify-end rounded-[1px] border pb-0.5 text-[7px] font-bold", on ? "border-black text-black" : "border-zinc-800 bg-zinc-900 text-zinc-500")}
            style={on ? { background: deg === 0 ? "#a855f7" : "#4ade80", boxShadow: `0 0 5px ${deg === 0 ? "#a855f7" : "#4ade80"}` } : undefined}
          >
            {NOTE_NAMES[(scale.root + deg) % 12]}
          </button>
        ))}
      </div>
      <MiniPiano className="mt-1" lit={pcLit} onKey={(pc) => toggle((pc - scale.root + 12) % 12)} />
    </Section>
  );
}
