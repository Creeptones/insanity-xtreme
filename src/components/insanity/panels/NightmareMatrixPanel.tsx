"use client";

import { memo } from "react";
import { MOD_SLOTS } from "@/lib/insanity/params";
import { ACCENTS, ParamKnob } from "../InsanityKnob";
import { Section } from "../InsanityPrimitives";
import { useParam } from "../InsanityContext";
import { ModSlotSelect } from "./modLabels";

const SLOT_COLORS = [ACCENTS[0], ACCENTS[3], ACCENTS[1], ACCENTS[4]] as const;

const Slot = memo(function Slot({ i }: { i: number }): JSX.Element {
  const [src] = useParam(`mod${i}.src`);
  const [amt] = useParam(`mod${i}.amount`);
  const active = Math.round(src) !== 0 && amt !== 0;
  const color = SLOT_COLORS[Math.floor((i - 1) / 16) % SLOT_COLORS.length];
  return (
    <div className="flex min-w-0 items-center gap-px rounded-[2px] border border-zinc-800/70 bg-black/30 px-px">
      <div className="flex min-w-0 flex-1 flex-col gap-px py-px">
        <div className="flex min-w-0 items-center gap-px">
          <span
            className="w-3 shrink-0 text-center font-mono text-[7px] font-bold"
            style={{ color: active ? color : "#52525b", textShadow: active ? `0 0 4px ${color}` : undefined }}
          >
            {String(i).padStart(2, "0")}
          </span>
          <ModSlotSelect id={`mod${i}.src`} kind="src" className="flex-1" />
        </div>
        <ModSlotSelect id={`mod${i}.dst`} kind="dst" className="w-full" />
      </div>
      <ParamKnob id={`mod${i}.amount`} size={16} color={color} hideLabel />
    </div>
  );
});

/** "SOUND DESIGNER'S NIGHTMARE MATRIX": all 64 mod-matrix slots as compact strips. */
export const NightmareMatrixPanel = memo(function NightmareMatrixPanel(): JSX.Element {
  return (
    <Section title="Sound Designer's Nightmare Matrix" badge="(64x)" className="h-full" bodyClassName="grid grid-cols-6 content-start gap-0.5 max-lg:grid-cols-1 max-lg:gap-1">
      {Array.from({ length: MOD_SLOTS }, (_, k) => (
        <Slot key={k} i={k + 1} />
      ))}
    </Section>
  );
});
