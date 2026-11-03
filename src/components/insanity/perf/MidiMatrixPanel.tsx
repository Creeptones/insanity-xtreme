"use client";

// INSANITY perf — MIDI MATRIX / PROCESSOR: transpose, octave, velocity curve and scale,
// channel filter, note range; Web MIDI enable + device list; live monitor.

import { RawKnob, ACCENTS } from "../InsanityKnob";
import { ChunkyButton, Section } from "../InsanityPrimitives";
import { VEL_CURVES, noteName, type MatrixSettings } from "@/lib/insanity/perf/theory";
import { usePerf, usePerfSettings, useSignal } from "./PerformanceContext";
import { Label, LitButton, MiniSelect } from "./perfUi";

const CHANNELS = Array.from({ length: 17 }, (_, i) => i);

function MidiDevices(): JSX.Element {
  const perf = usePerf();
  useSignal(perf.midiSig);
  const m = perf.midi;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-center gap-1">
        <LitButton on={m.enabled} onClick={() => (m.enabled ? perf.disableMidi() : void perf.enableMidi())} title="Web MIDI input">
          {m.enabled ? "MIDI ON" : "ENABLE MIDI"}
        </LitButton>
        <Label>{m.enabled ? `${m.devices.length} device${m.devices.length === 1 ? "" : "s"}` : m.supported === false ? "unsupported" : "off"}</Label>
      </div>
      {m.error ? <div className="text-[8px] text-red-400">{m.error}</div> : null}
      {m.enabled ? (
        <ul className="max-h-10 overflow-auto text-[8px] text-zinc-300">
          {m.devices.length === 0 ? <li className="text-zinc-500">no inputs connected</li> : m.devices.map((d) => <li key={d} className="truncate">▸ {d}</li>)}
        </ul>
      ) : null}
      <Label className="mt-0.5">monitor</Label>
      <ol className="h-[7.5rem] overflow-hidden rounded-[2px] border border-zinc-800 bg-black p-0.5 font-mono text-[8px] leading-[10px] text-emerald-400">
        {m.monitor.length === 0 ? <li className="text-zinc-600">waiting for MIDI…</li> : m.monitor.map((line, i) => (
          <li key={`${m.monitor.length}-${i}-${line}`} className={i === 0 ? "text-emerald-300" : "opacity-70"}>{line}</li>
        ))}
      </ol>
    </div>
  );
}

export function MidiMatrixPanel(): JSX.Element {
  const perf = usePerf();
  const { matrix } = usePerfSettings();
  const set = (p: Partial<MatrixSettings>): void => perf.update("matrix", p);
  const c = ACCENTS[0];
  return (
    <Section title="MIDI Matrix / Processor">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
        <div className="flex flex-col gap-1">
          <div className="grid grid-cols-3 gap-x-0.5 gap-y-1">
            <RawKnob label="Transp" value={matrix.transpose} min={-24} max={24} integer defaultValue={0} color={c} onChange={(v) => set({ transpose: v })} format={(v) => `${v > 0 ? "+" : ""}${Math.round(v)}st`} />
            <RawKnob label="Octave" value={matrix.octave} min={-3} max={3} integer defaultValue={0} color={c} onChange={(v) => set({ octave: v })} format={(v) => `${v > 0 ? "+" : ""}${Math.round(v)}`} />
            <RawKnob label="Vel Scl" value={matrix.velScale} min={0} max={2} defaultValue={1} color={c} onChange={(v) => set({ velScale: v })} format={(v) => `${Math.round(v * 100)}%`} />
            <RawKnob label="Fix Vel" value={matrix.fixedVel} min={0.05} max={1} defaultValue={0.8} color={c} onChange={(v) => set({ fixedVel: v })} format={(v) => String(Math.round(v * 127))} />
            <RawKnob label="Low" value={matrix.lowNote} min={0} max={127} integer defaultValue={0} color={c} onChange={(v) => set({ lowNote: Math.min(v, matrix.highNote) })} format={(v) => noteName(Math.round(v))} />
            <RawKnob label="High" value={matrix.highNote} min={0} max={127} integer defaultValue={127} color={c} onChange={(v) => set({ highNote: Math.max(v, matrix.lowNote) })} format={(v) => noteName(Math.round(v))} />
          </div>
          <div className="flex gap-1">
            <MiniSelect label="Vel curve" value={matrix.velCurve} options={VEL_CURVES} onChange={(v) => set({ velCurve: v })} />
            <MiniSelect label="Channel" value={matrix.channel} options={CHANNELS} onChange={(v) => set({ channel: v })} format={(v) => (v === 0 ? "omni" : `ch ${v}`)} />
          </div>
          <ChunkyButton danger onClick={() => perf.allOff()} title="Release every held note">All notes off</ChunkyButton>
        </div>
        <MidiDevices />
      </div>
    </Section>
  );
}
