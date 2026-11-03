"use client";

import { memo } from "react";
import { ACCENTS, ParamKnob } from "../InsanityKnob";
import { Section } from "../InsanityPrimitives";

const GROUPS: readonly { name: string; color: string; knobs: readonly [string, string][] }[] = [
  { name: "Drive", color: ACCENTS[6], knobs: [["fx.drive.db", "Drive"], ["fx.drive.mix", "Mix"]] },
  { name: "Bitcrush", color: ACCENTS[2], knobs: [["fx.crush.bits", "Bits"], ["fx.crush.rate", "Down"], ["fx.crush.mix", "Mix"]] },
  { name: "Chorus", color: ACCENTS[1], knobs: [["fx.chorus.rate", "Rate"], ["fx.chorus.depth", "Depth"], ["fx.chorus.mix", "Mix"]] },
  { name: "Phaser", color: ACCENTS[0], knobs: [["fx.phaser.rate", "Rate"], ["fx.phaser.depth", "Depth"], ["fx.phaser.mix", "Mix"]] },
  { name: "Delay", color: ACCENTS[5], knobs: [["fx.delay.time", "Time"], ["fx.delay.feedback", "Fdbk"], ["fx.delay.damping", "Damp"], ["fx.delay.mix", "Mix"]] },
  { name: "Reverb", color: ACCENTS[3], knobs: [["fx.reverb.size", "Size"], ["fx.reverb.damping", "Damp"], ["fx.reverb.mix", "Mix"]] },
  { name: "Ring Mod", color: ACCENTS[4], knobs: [["fx.ring.freq", "Freq"], ["fx.ring.mix", "Mix"]] },
  { name: "Stereo", color: ACCENTS[7], knobs: [["fx.width", "Width"]] },
];

/** "EFFECTS GALAXY": every fx.* param, one row per effect. */
export const EffectsPanel = memo(function EffectsPanel(): JSX.Element {
  return (
    <Section title="Effects Galaxy" badge="(12x)" className="h-full" bodyClassName="grid grid-cols-2 content-start gap-0.5">
      {GROUPS.map((g) => (
        <div key={g.name} className="flex min-w-0 flex-col gap-0.5 rounded-[2px] border border-zinc-800/80 bg-black/30 p-0.5">
          <div className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: g.color, boxShadow: `0 0 4px ${g.color}` }} />
            <span className="truncate text-[8px] font-bold uppercase tracking-wider text-zinc-300">{g.name}</span>
          </div>
          <div className="flex flex-wrap justify-start gap-x-0.5">
            {g.knobs.map(([id, label]) => (
              <ParamKnob key={id} id={id} label={label} size={24} color={g.color} />
            ))}
          </div>
        </div>
      ))}
    </Section>
  );
});
