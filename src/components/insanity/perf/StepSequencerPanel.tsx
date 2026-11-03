"use client";

// INSANITY perf — STEP SEQUENCER / MEGA ARPEGGIATOR.
// 16 steps × 8 lanes. Click a cell to toggle it; Shift-click cycles ratchet (1-4),
// Alt-click cycles probability (100/75/50/25%). Click a row label to select that lane,
// then draw velocity / probability / ratchet in the strip below the grid.
// The arpeggiator controls live in the right-hand column and share the tempo.

import { memo, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { cn } from "@/lib/cn";
import { ARP_MODES, DIVISIONS, noteName, type ArpMode } from "@/lib/insanity/perf/theory";
import { SEQ_STEPS, type ArpSettings, type LaneMode, type SeqCell, type SeqSettings } from "@/lib/insanity/perf/engine";
import { ACCENTS, ParamKnob, RawKnob } from "../InsanityKnob";
import { ChunkyButton, Section } from "../InsanityPrimitives";
import { usePerf, usePerfSettings, useSignal } from "./PerformanceContext";
import { Label, LitButton, MiniSelect } from "./perfUi";

const PROBS = [1, 0.75, 0.5, 0.25];
const LANE_MODES: readonly LaneMode[] = ["degrees", "semitones"];
type EditMode = "vel" | "prob" | "ratchet";
const EDIT_MODES: readonly EditMode[] = ["vel", "prob", "ratchet"];

const Cell = memo(function Cell({ cell, lane, step, playhead, beat, onCell }: {
  cell: SeqCell; lane: number; step: number; playhead: boolean; beat: boolean;
  onCell: (lane: number, step: number, e: MouseEvent) => void;
}) {
  const color = cell.prob < 1 ? "245,158,11" : "74,222,128";
  const a = cell.on ? 0.35 + cell.vel * 0.65 : 0;
  return (
    <button
      type="button"
      aria-label={`lane ${lane + 1} step ${step + 1}${cell.on ? " on" : ""}`}
      aria-pressed={cell.on}
      onClick={(e) => onCell(lane, step, e)}
      className={cn(
        "relative h-3.5 rounded-[1px] border",
        cell.on ? "border-black" : beat ? "border-zinc-700 bg-zinc-800" : "border-zinc-800 bg-zinc-900",
        playhead && "ring-1 ring-white/70",
      )}
      style={cell.on ? { background: `rgba(${color},${a})`, boxShadow: playhead ? `0 0 8px rgb(${color})` : `0 0 4px rgba(${color},0.6)` } : playhead ? { background: "#3f3f46" } : undefined}
    >
      {cell.on && cell.ratchet > 1 ? (
        <span className="absolute inset-0 flex items-center justify-center text-[7px] font-bold leading-none text-black">{"•".repeat(cell.ratchet)}</span>
      ) : null}
    </button>
  );
});

function laneLabel(s: SeqSettings, offset: number): string {
  if (s.laneMode === "degrees") return `DEG ${offset >= 0 ? "+" : ""}${offset}`;
  return `${noteName(s.root + offset)}`;
}

function Grid({ sel, setSel }: { sel: number; setSel: (l: number) => void }): JSX.Element {
  const perf = usePerf();
  const { seq } = usePerfSettings();
  useSignal(perf.seqSig);
  const pos = perf.seqPos;
  const onCell = (lane: number, step: number, e: MouseEvent): void => {
    const c = seq.lanes[lane].cells[step];
    if (e.shiftKey) perf.setCell(lane, step, { on: true, ratchet: (c.ratchet % 4) + 1 });
    else if (e.altKey) perf.setCell(lane, step, { on: true, prob: PROBS[(PROBS.indexOf(c.prob) + 1) % PROBS.length] ?? 1 });
    else perf.setCell(lane, step, { on: !c.on });
    setSel(lane);
  };
  return (
    <div className="grid gap-[2px]" style={{ gridTemplateColumns: `3.4rem repeat(${SEQ_STEPS}, minmax(0,1fr))` }}>
      {seq.lanes.map((lane, li) => (
        <div key={li} className="contents">
          <button
            type="button"
            onClick={() => setSel(li)}
            className={cn("h-3.5 truncate rounded-[1px] px-0.5 text-left font-mono text-[8px] leading-none", sel === li ? "bg-violet-700 text-white" : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800")}
            title="Select lane"
          >
            {laneLabel(seq, lane.offset)}
          </button>
          {lane.cells.map((cell, si) => (
            <div key={si} className={cn(si >= seq.length && "opacity-25")}>
              <Cell cell={cell} lane={li} step={si} playhead={pos === si} beat={si % 4 === 0} onCell={onCell} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function LaneStrip({ lane }: { lane: number }): JSX.Element {
  const perf = usePerf();
  const { seq } = usePerfSettings();
  const [mode, setMode] = useState<EditMode>("vel");
  const ref = useRef<HTMLDivElement>(null);
  const cells = seq.lanes[lane].cells;
  const draw = (e: PointerEvent<HTMLDivElement>): void => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const step = Math.floor(((e.clientX - r.left) / r.width) * SEQ_STEPS);
    if (step < 0 || step >= SEQ_STEPS) return;
    const n = 1 - Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    if (mode === "vel") perf.setCell(lane, step, { vel: Math.max(0.05, n) });
    else if (mode === "prob") perf.setCell(lane, step, { prob: Math.max(0.05, Math.round(n * 20) / 20) });
    else perf.setCell(lane, step, { ratchet: 1 + Math.min(3, Math.floor(n * 4)) });
  };
  const value = (c: SeqCell): number => (mode === "vel" ? c.vel : mode === "prob" ? c.prob : c.ratchet / 4);
  return (
    <div className="mt-1 grid gap-1" style={{ gridTemplateColumns: "3.4rem minmax(0,1fr)" }}>
      <div className="flex flex-col gap-0.5">
        <MiniSelect value={mode} options={EDIT_MODES} onChange={setMode} />
        <Label>lane {lane + 1}</Label>
      </div>
      <div
        ref={ref}
        className="grid h-7 cursor-crosshair touch-none items-end gap-[2px] rounded-[1px] bg-black"
        style={{ gridTemplateColumns: `repeat(${SEQ_STEPS}, minmax(0,1fr))` }}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); draw(e); }}
        onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) draw(e); }}
        title={`Draw ${mode} for lane ${lane + 1}`}
      >
        {cells.map((c, i) => (
          <div key={i} className={cn("w-full rounded-t-[1px]", c.on ? (mode === "prob" ? "bg-amber-400" : mode === "ratchet" ? "bg-sky-400" : "bg-emerald-400") : "bg-zinc-700")}
            style={{ height: `${value(c) * 100}%` }} />
        ))}
      </div>
    </div>
  );
}

function ArpControls(): JSX.Element {
  const perf = usePerf();
  const { arp } = usePerfSettings();
  const set = (p: Partial<ArpSettings>): void => perf.update("arp", p);
  const c = ACCENTS[2];
  return (
    <div className="flex flex-col gap-1 rounded-[2px] border border-zinc-800 p-1">
      <div className="flex items-end gap-1">
        <MiniSelect label="Arp" value={arp.mode} options={ARP_MODES} onChange={(v: ArpMode) => set({ mode: v })} />
        <MiniSelect label="Rate" value={arp.rate} options={DIVISIONS} onChange={(v) => set({ rate: v })} />
        <LitButton on={arp.latch} onClick={() => set({ latch: !arp.latch })} color="#f59e0b" title="Keep arpeggiating after keys are released">Latch</LitButton>
      </div>
      <div className="flex gap-0.5">
        <RawKnob label="Oct" value={arp.octaves} min={1} max={4} integer defaultValue={1} color={c} onChange={(v) => set({ octaves: v })} />
        <RawKnob label="Gate" value={arp.gate} min={0.05} max={1} defaultValue={0.6} color={c} onChange={(v) => set({ gate: v })} format={(v) => `${Math.round(v * 100)}%`} />
        <RawKnob label="Swing" value={arp.swing} min={0} max={1} defaultValue={0} color={c} onChange={(v) => set({ swing: v })} format={(v) => `${Math.round(v * 100)}%`} />
      </div>
    </div>
  );
}

export function StepSequencerPanel(): JSX.Element {
  const perf = usePerf();
  const { seq } = usePerfSettings();
  useSignal(perf.seqSig);
  const [sel, setSel] = useState(7);
  const set = (p: Partial<SeqSettings>): void => perf.update("seq", p);
  const c = ACCENTS[3];
  const lane = seq.lanes[sel];
  return (
    <Section title="Step Sequencer / Mega Arpeggiator" badge="(16×8)">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-1.5">
        <div className="min-w-0">
          <Grid sel={sel} setSel={setSel} />
          <LaneStrip lane={sel} />
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <RawKnob label={`Lane ${sel + 1}`} value={lane.offset} min={-24} max={24} integer defaultValue={0} color={c}
              onChange={(v) => perf.setLaneOffset(sel, v)} format={(v) => (seq.laneMode === "degrees" ? `deg ${Math.round(v)}` : `${Math.round(v)}st`)} />
            <Label className="max-w-[14rem] normal-case">click = on/off · shift-click = ratchet · alt-click = probability (amber)</Label>
          </div>
        </div>
        <div className="flex w-[9.5rem] flex-col gap-1">
          <div className="flex gap-1">
            <ChunkyButton active={perf.seqPlaying} onClick={() => perf.toggleSeq()} className="flex-1">{perf.seqPlaying ? "■ Stop" : "▶ Play"}</ChunkyButton>
          </div>
          <div className="flex gap-1">
            <MiniSelect label="Rate" value={seq.rate} options={DIVISIONS} onChange={(v) => set({ rate: v })} />
            <MiniSelect label="Lanes" value={seq.laneMode} options={LANE_MODES} onChange={(v) => set({ laneMode: v })} />
          </div>
          <div className="flex flex-wrap gap-0.5">
            <ParamKnob id="global.tempo" label="BPM" color={c} />
            <RawKnob label="Swing" value={seq.swing} min={0} max={1} defaultValue={0} color={c} onChange={(v) => set({ swing: v })} format={(v) => `${Math.round(v * 100)}%`} />
            <RawKnob label="Gate" value={seq.gate} min={0.05} max={1} defaultValue={0.5} color={c} onChange={(v) => set({ gate: v })} format={(v) => `${Math.round(v * 100)}%`} />
            <RawKnob label="Length" value={seq.length} min={1} max={SEQ_STEPS} integer defaultValue={16} color={c} onChange={(v) => set({ length: v })} />
            <RawKnob label="Root" value={seq.root} min={24} max={84} integer defaultValue={48} color={c} onChange={(v) => set({ root: v })} format={(v) => noteName(Math.round(v))} />
          </div>
          <div className="flex flex-wrap gap-1">
            <LitButton on={seq.holdTranspose} onClick={() => set({ holdTranspose: !seq.holdTranspose })} title="While playing, held keys transpose the pattern (C4 = no change)">Key transp</LitButton>
            <LitButton on={false} onClick={() => perf.randomizeSeq()} title="Roll the dice">Random</LitButton>
            <LitButton on={false} onClick={() => perf.clearSeq()}>Clear</LitButton>
          </div>
          <ArpControls />
        </div>
      </div>
    </Section>
  );
}
