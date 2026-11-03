"use client";

import { memo, useRef } from "react";
import { ACCENTS, ParamKnob, ParamToggle } from "../InsanityKnob";
import { ChunkyButton, Section } from "../InsanityPrimitives";
import { useEngineStarted, useInsanityHost, useParam } from "../InsanityContext";
import { useFrame } from "./frame";

/** "SYSTEM": voice count, glide, bend, tempo, DESTROY CPU readout, PANIC + ALL NOTES OFF. */
export const SystemPanel = memo(function SystemPanel(): JSX.Element {
  const host = useInsanityHost();
  const started = useEngineStarted();
  const [destroy] = useParam("global.destroyCpu");
  const cpuRef = useRef<HTMLSpanElement>(null);
  const voicesRef = useRef<HTMLSpanElement>(null);
  const lastSeen = useRef<unknown>(null);

  useFrame(() => {
    const m = host.lastMeters;
    if (!m || m === lastSeen.current) return;
    lastSeen.current = m;
    if (cpuRef.current) cpuRef.current.textContent = `${(m.cpu * 100).toFixed(0)}%`;
    if (voicesRef.current) voicesRef.current.textContent = String(m.voices);
  });

  const sr = host.ctx?.sampleRate;
  return (
    <Section title="System" className="h-full" bodyClassName="flex flex-col gap-1.5">
      <div className="grid grid-cols-2 justify-items-center gap-y-1">
        <ParamKnob id="voice.polyphony" label="Voices" color={ACCENTS[0]} />
        <ParamKnob id="voice.glide" label="Glide" color={ACCENTS[0]} />
        <ParamKnob id="voice.bendRange" label="Bend" color={ACCENTS[1]} />
        <ParamKnob id="global.tempo" label="Tempo" color={ACCENTS[2]} />
      </div>

      <div className="rounded-[2px] border border-zinc-800 bg-black/60 p-1 font-mono text-[8px] leading-snug text-zinc-400">
        <div className="flex justify-between"><span>ENGINE</span><span className={started ? "text-green-400" : "text-red-400"}>{started ? "ONLINE" : "ASLEEP"}</span></div>
        <div className="flex justify-between"><span>SR</span><span>{sr ? `${(sr / 1000).toFixed(1)}k` : "--"}</span></div>
        <div className="flex justify-between"><span>CPU</span><span ref={cpuRef} className="text-amber-300">--</span></div>
        <div className="flex justify-between"><span>VOICES</span><span ref={voicesRef} className="text-cyan-300">0</span></div>
      </div>

      <div className="flex flex-col items-center gap-0.5 rounded-[2px] border border-red-950 bg-red-950/20 p-1">
        <div className="text-[7px] font-bold uppercase tracking-wider text-red-300">Destroy CPU</div>
        <ParamToggle id="global.destroyCpu" label={destroy >= 0.5 ? "ON" : "OFF"} color="#ef4444" className="h-4 w-full text-[8px]" />
        <div className={destroy >= 0.5 ? "text-center text-[7px] uppercase text-red-400" : "text-center text-[7px] uppercase text-zinc-600"}>
          {destroy >= 0.5 ? "8x unison everywhere" : "armed"}
        </div>
      </div>

      <div className="mt-auto flex flex-col gap-1">
        <ChunkyButton onClick={() => host.allNotesOff()} title="Release every held note">All notes off</ChunkyButton>
        <ChunkyButton danger onClick={() => host.panic()} title="Hard-stop every voice and clear effect tails">Panic</ChunkyButton>
      </div>
    </Section>
  );
});
