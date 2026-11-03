"use client";

import { memo, type ReactNode } from "react";
import { ACCENTS, ParamKnob, ParamSelect } from "../InsanityKnob";
import { Section } from "../InsanityPrimitives";

function Group({ title, color, children }: { title: string; color: string; children: ReactNode }): JSX.Element {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-[2px] border border-zinc-800/80 bg-black/30 p-0.5">
      <div className="text-[7px] font-bold uppercase tracking-wider" style={{ color }}>{title}</div>
      <div className="flex flex-wrap items-end gap-x-0.5">{children}</div>
    </div>
  );
}

const ADSR = [["attack", "A"], ["decay", "D"], ["sustain", "S"], ["release", "R"]] as const;

function VoiceFilter({ f, color }: { f: 1 | 2; color: string }): JSX.Element {
  return (
    <Group title={`Filter ${f}`} color={color}>
      <div className="flex w-full items-center"><ParamSelect id={`vf${f}.type`} className="w-full" /></div>
      <ParamKnob id={`vf${f}.cutoff`} label="Cut" size={20} color={color} />
      <ParamKnob id={`vf${f}.reso`} label="Res" size={20} color={color} />
      <ParamKnob id={`vf${f}.drive`} label="Drv" size={20} color={color} />
      <ParamKnob id={`vf${f}.envAmt`} label="Env" size={20} color={color} />
      <ParamKnob id={`vf${f}.keytrack`} label="Key" size={20} color={color} />
    </Group>
  );
}

/** "VOICE PROCESSING": amp + filter envelopes, the two per-voice filters and their routing. */
export const VoicePanel = memo(function VoicePanel(): JSX.Element {
  return (
    <Section title="Voice Processing" className="h-full" bodyClassName="grid grid-cols-2 gap-0.5">
      <Group title="Amp Env" color={ACCENTS[3]}>
        {ADSR.map(([k, l]) => <ParamKnob key={k} id={`amp.${k}`} label={l} size={20} color={ACCENTS[3]} />)}
      </Group>
      <Group title="Filter Env" color={ACCENTS[2]}>
        {ADSR.map(([k, l]) => <ParamKnob key={k} id={`fenv.${k}`} label={l} size={20} color={ACCENTS[2]} />)}
      </Group>
      <VoiceFilter f={1} color={ACCENTS[0]} />
      <VoiceFilter f={2} color={ACCENTS[1]} />
      <div className="col-span-2 flex items-center gap-1 text-[7px] uppercase text-zinc-400">
        Filter routing <ParamSelect id="vf.routing" />
      </div>
    </Section>
  );
});
