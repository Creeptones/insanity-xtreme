"use client";

// INSANITY — RANDOMIZER SUPREME, SOUND BROWSER / HOARDER and HELP / I HAVE NO IDEA.

import { useCallback, useState } from "react";
import { cn } from "@/lib/cn";
import type { ParamGroup } from "@/lib/insanity/params";
import { FACTORY_PRESETS, MAGIC_PRESET } from "@/lib/insanity/presets";
import { RANDOM_GROUPS, randomize } from "@/lib/insanity/randomize";
import { useInsanityHost } from "../InsanityContext";
import { ACCENTS, RawKnob } from "../InsanityKnob";
import { ChunkyButton, Section } from "../InsanityPrimitives";
import { useSession } from "./session";
import { SOUND_BROWSER_ID } from "./TopBar";

// ---- RANDOMIZER SUPREME ----------------------------------------------------

const DEFAULT_GROUPS: readonly ParamGroup[] = ["osc", "voice", "fx", "lfo", "mod"];

export function RandomizerPanel(): JSX.Element {
  const host = useInsanityHost();
  const [state, session] = useSession();
  const [groups, setGroups] = useState<ReadonlySet<ParamGroup>>(() => new Set(DEFAULT_GROUPS));
  // Real amount 0..1; the knob DISPLAYS it ×1000 % because this plugin goes to 1000.
  const [amount, setAmount] = useState(0.35);
  const [rolls, setRolls] = useState(0);

  const toggle = useCallback((g: ParamGroup) => {
    setGroups((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g); else next.add(g);
      return next;
    });
  }, []);

  const doIt = useCallback(() => {
    if (groups.size === 0) {
      session.say("Randomized nothing, as requested. Tick a box.");
      return;
    }
    const n = rolls + 1;
    setRolls(n);
    session.apply(randomize(host.values, groups, Math.max(0, Math.min(1, amount))), `RANDOM #${n} (${Math.round(amount * 1000)}% CHAOS)`);
  }, [amount, groups, host, rolls, session]);

  const chaosLevel = amount < 0.15 ? "MILD" : amount < 0.4 ? "SPICY" : amount < 0.7 ? "UNHINGED" : "CALL A PRIEST";

  return (
    <Section title="RANDOMIZER SUPREME" className="h-full" bodyClassName="flex gap-1.5">
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 text-[8px] font-bold uppercase tracking-wide text-zinc-400">WHAT TO RANDOMIZE</div>
        <div className="grid grid-cols-2 gap-x-1.5">
          {RANDOM_GROUPS.map(({ group, label }) => (
            <label key={group} className="flex cursor-pointer items-center gap-1 text-[8px] uppercase leading-[13px] text-zinc-300">
              <input type="checkbox" checked={groups.has(group)} onChange={() => toggle(group)} className="h-2.5 w-2.5 accent-red-600" />
              <span className="truncate">{label}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="flex w-[84px] shrink-0 flex-col items-center gap-1 rounded-[2px] border border-zinc-800 bg-black/40 p-1">
        <div className="text-[7px] font-bold uppercase text-zinc-400">AMOUNT OF CHAOS</div>
        <RawKnob
          value={amount}
          min={0}
          max={1}
          defaultValue={0.35}
          onChange={setAmount}
          size={40}
          color={ACCENTS[6]}
          format={(v) => `${Math.round(v * 1000)}%`}
          label="Chaos"
        />
        <div className={cn("text-[7px] font-bold uppercase", amount >= 0.7 ? "text-red-400" : "text-zinc-500")}>{chaosLevel}</div>
        <ChunkyButton danger onClick={doIt} className="w-full">DO IT</ChunkyButton>
        <ChunkyButton onClick={() => session.undo()} className={cn("w-full", !state.canUndo && "opacity-40")} title="Back to before the last preset load or randomize">
          UNDO
        </ChunkyButton>
      </div>
    </Section>
  );
}

// ---- SOUND BROWSER / HOARDER -------------------------------------------------

function Stars({ n }: { n: number }): JSX.Element {
  return (
    <span className="tracking-[-1px]" aria-label={`${n} of 5 stars`}>
      <span className="text-amber-400">{"★".repeat(n)}</span>
      <span className="text-zinc-700">{"★".repeat(5 - n)}</span>
    </span>
  );
}

export function SoundBrowserPanel(): JSX.Element {
  const [state, session] = useSession();
  const rows = [
    ...FACTORY_PRESETS.map((p) => ({ key: `f:${p.name}`, name: p.name, type: p.type, rating: p.rating, load: () => session.loadFactory(p) })),
    ...state.userPresets.map((u) => ({ key: `u:${u.name}`, name: u.name, type: "USER", rating: 5, load: () => session.loadUser(u) })),
  ];
  return (
    <Section title="SOUND BROWSER / HOARDER" badge={`(${rows.length})`} className="h-full" bodyClassName="p-0">
      <div id={SOUND_BROWSER_ID} tabIndex={-1} className="max-h-48 overflow-y-auto outline-none">
        <table className="w-full border-collapse text-[8px]">
          <thead className="sticky top-0 bg-zinc-900 text-zinc-500">
            <tr>
              <th className="px-1 text-left font-normal">#</th>
              <th className="px-1 text-left font-normal">NAME</th>
              <th className="px-1 text-left font-normal">TYPE</th>
              <th className="px-1 text-left font-normal">RATING</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const current = r.name === state.presetName;
              return (
                <tr
                  key={r.key}
                  tabIndex={0}
                  onClick={r.load}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); r.load(); } }}
                  className={cn("cursor-pointer border-t border-zinc-900 hover:bg-violet-900/30 focus-visible:bg-violet-900/30 focus-visible:outline-none", current && "bg-violet-900/50")}
                >
                  <td className="px-1 font-mono text-zinc-500">{String(i + 1).padStart(3, "0")}.</td>
                  <td className={cn("max-w-[160px] truncate px-1", r.type === "USER" ? "text-emerald-300" : "text-fuchsia-300")}>{r.name}</td>
                  <td className="px-1 text-zinc-400">{r.type}</td>
                  <td className="px-1"><Stars n={r.rating} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

// ---- HELP / I HAVE NO IDEA -----------------------------------------------------

const TIPS: readonly string[] = [
  "Double-click any knob to reset it. Shift-drag for fine control.",
  "DESTROY CPU forces 8-voice unison on every active oscillator. The CPU meter is not lying.",
  "Mod Matrix amounts are in normalised units: +1 sweeps the destination's whole range.",
  "Filter 1 Env Amt plus a short Filter Env Decay is the entire recipe for a pluck.",
  "Set Polyphony to 1 and add Glide for a mono bass that slides between notes.",
  "The Braids layer's model menu swaps the physical model: pluck, bell, reed, bowed or breath.",
  "Pollen is monophonic: hold a chord and it plays the newest note, which is fine for pads.",
  "The FM osc's Shape knob is the FM index. Route ampEnv to it for a bell that darkens as it rings.",
  "Additive osc: Shape tilts the spectrum, Ratio stretches the partials.",
  "The chaos osc is a Van der Pol oscillator. Shape is mu; small values are almost a sine.",
  "Layers go through the same filter bank, effects and master as the synth.",
  "UNDO in the Randomizer also undoes a preset load. One step only. Choose wisely.",
  "Delay feedback above 0.8 plus a big reverb is how you make a drone out of anything.",
  "Ring Mod Freq near the played note gives metallic bells; far from it gives robots.",
  "Amount of Chaos reads ×10: 100% is a gentle nudge, 1000% rerolls everything you ticked.",
];

const GIVE_UP_LINES: readonly string[] = [
  "Understandable. Everything is quiet now.",
  "Giving up is a valid workflow. Notes stopped.",
  "Silence: the most advanced preset of all.",
  "Fine. Panic sent. Take a walk.",
];

export function HelpPanel(): JSX.Element {
  const host = useInsanityHost();
  const [, session] = useSession();
  const [tip, setTip] = useState<string | null>(null);

  const randomTip = useCallback(() => {
    setTip((prev) => {
      let t = prev;
      while (t === prev) t = TIPS[Math.floor(Math.random() * TIPS.length)];
      return t;
    });
  }, []);

  return (
    <Section title="HELP / I HAVE NO IDEA" className="h-full" bodyClassName="flex flex-col gap-1">
      <ChunkyButton onClick={randomTip}>RANDOM TUTORIAL</ChunkyButton>
      {tip ? <p className="rounded-[2px] bg-black/50 px-1 py-0.5 text-[8px] leading-tight text-zinc-300">{tip}</p> : null}
      <ChunkyButton onClick={() => { session.loadFactory(MAGIC_PRESET); session.say("Magic applied. It sounds good now."); }}>
        MAKE IT SOUND GOOD (MAGIC)
      </ChunkyButton>
      <ChunkyButton onClick={() => { session.reset(); session.say("Everything fixed. (Reset to defaults.)"); }}>FIX EVERYTHING</ChunkyButton>
      <ChunkyButton onClick={() => { host.panic(); session.say(GIVE_UP_LINES[Math.floor(Math.random() * GIVE_UP_LINES.length)]); }}>
        I GIVE UP
      </ChunkyButton>
      <a
        href="https://www.youtube.com/watch?v=G8iEMVr7GFg"
        target="_blank"
        rel="noopener noreferrer"
        title="Watch his detailed presentation"
        className="mt-auto flex flex-col items-center rounded-[3px] border border-red-900 bg-gradient-to-b from-red-600 to-red-900 py-1 text-white shadow-[0_0_10px_rgba(220,38,38,0.5)] hover:from-red-500"
      >
        <span className="text-[14px] font-black leading-none tracking-widest">SOS</span>
        <span className="text-[7px] uppercase leading-tight text-red-200">CALL FOR HELP</span>
      </a>
    </Section>
  );
}
