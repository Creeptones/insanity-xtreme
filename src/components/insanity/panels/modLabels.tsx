"use client";

// Shared labels and option lists for the mod matrix (Nightmare Matrix + Complex Modulation Routing).

import { memo, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { MOD_DESTS, MOD_SOURCES, PARAMS, type ParamGroup } from "@/lib/insanity/params";
import { useParam } from "../InsanityContext";

/** "lfo3" → "LFO 3", "xy2.x" → "XY 2 X", "noteRandom" → "NOTE RANDOM". */
export function sourceLabel(s: string): string {
  if (s === "none") return "—";
  const m = /^(lfo|env|func|macro|xy)(\d+)(?:\.(x|y))?$/.exec(s);
  if (m) return `${m[1].toUpperCase()} ${m[2]}${m[3] ? ` ${m[3].toUpperCase()}` : ""}`;
  return s.replace(/([a-z])([A-Z])/g, "$1 $2").toUpperCase();
}

export const DEST_GROUP_LABEL: Partial<Record<ParamGroup, string>> = {
  osc: "Oscillators", voice: "Voice", bank: "Filter bank", fx: "Effects", lfo: "LFOs", env: "Envelopes",
  func: "Functions", chaos: "Chaos", master: "Master", layer: "Layers", global: "Global",
};

let srcOptions: ReactNode[] | null = null;
let dstOptions: ReactNode[] | null = null;

function sourceOptions(): ReactNode[] {
  if (!srcOptions) srcOptions = MOD_SOURCES.map((s, i) => <option key={i} value={i}>{sourceLabel(s)}</option>);
  return srcOptions;
}
function destOptions(): ReactNode[] {
  if (!dstOptions) {
    const groups: { group: ParamGroup; items: ReactNode[] }[] = [];
    MOD_DESTS.forEach((pi, di) => {
      const p = PARAMS[pi];
      let last = groups[groups.length - 1];
      if (!last || last.group !== p.group) groups.push((last = { group: p.group, items: [] }));
      last.items.push(<option key={di} value={di}>{p.label}</option>);
    });
    dstOptions = groups.map((g, k) => (
      <optgroup key={`${g.group}${k}`} label={DEST_GROUP_LABEL[g.group] ?? g.group}>{g.items}</optgroup>
    ));
  }
  return dstOptions;
}

/**
 * Source/destination picker for one mod slot. With 64 slots × ~150 sources and ~350
 * destinations, every list is only built into the DOM once the select is touched; until
 * then it holds just the selected option.
 */
export const ModSlotSelect = memo(function ModSlotSelect({ id, kind, className }: { id: string; kind: "src" | "dst"; className?: string }): JSX.Element {
  const [value, set] = useParam(id);
  const [full, setFull] = useState(false);
  const v = Math.round(value);
  const label = kind === "src" ? sourceLabel(MOD_SOURCES[v] ?? "none") : (PARAMS[MOD_DESTS[v] ?? -1]?.label ?? "?");
  const expand = (): void => { if (!full) setFull(true); };
  return (
    <select
      title={label}
      value={v}
      onPointerDown={expand}
      onFocus={expand}
      onChange={(e) => set(Number(e.target.value))}
      className={cn("h-3.5 min-w-0 rounded-[2px] border border-zinc-700 bg-zinc-900 px-0 text-[7px] uppercase text-zinc-300", className)}
    >
      {full ? (kind === "src" ? sourceOptions() : destOptions()) : <option value={v}>{label}</option>}
    </select>
  );
});
