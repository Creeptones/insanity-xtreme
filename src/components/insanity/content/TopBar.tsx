"use client";

// INSANITY — the top bar: logo, preset slot (prev/next, LOAD/SAVE/SAVE AS/DELETE),
// RANDOMIZE EVERYTHING, DESTROY CPU and the CPU / voices / polyphony readout.
// One compact row like the reference screenshot (wraps on narrow screens).

import { useCallback } from "react";
import { cn } from "@/lib/cn";
import { randomize, RANDOM_GROUPS } from "@/lib/insanity/randomize";
import type { ParamGroup } from "@/lib/insanity/params";
import { useEngineStarted, useInsanityHost, useMeters, useParam } from "../InsanityContext";
import { ChunkyButton, MeterBar } from "../InsanityPrimitives";
import { useSession } from "./session";

export const SOUND_BROWSER_ID = "insanity-sound-browser";
const ALL_GROUPS: ReadonlySet<ParamGroup> = new Set(RANDOM_GROUPS.map((g) => g.group));
let randomCount = 0;

function Readout({ label, value, warn }: { label: string; value: string; warn?: boolean }): JSX.Element {
  return (
    <div className="flex items-baseline gap-1 font-mono text-[9px] leading-tight">
      <span className="text-zinc-500">{label}</span>
      <span className={cn("tabular-nums", warn ? "text-red-400" : "text-emerald-400")}>{value}</span>
    </div>
  );
}

export function TopBar(): JSX.Element {
  const host = useInsanityHost();
  const [state, session] = useSession();
  const meters = useMeters();
  const started = useEngineStarted();
  const [destroy, setDestroy] = useParam("global.destroyCpu");
  const [poly] = useParam("voice.polyphony");
  const destroyOn = destroy >= 0.5;

  const onLoad = useCallback(() => {
    const el = typeof document !== "undefined" ? document.getElementById(SOUND_BROWSER_ID) : null;
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.focus({ preventScroll: true });
    } else {
      session.step(1);
    }
  }, [session]);

  const onSaveAs = useCallback(() => {
    if (typeof window === "undefined") return;
    const name = window.prompt("Name this masterpiece:", state.isUser ? state.presetName : "My Banger");
    if (name) session.saveAs(name);
  }, [session, state.isUser, state.presetName]);

  const onSave = useCallback(() => {
    if (!session.save()) onSaveAs();
  }, [session, onSaveAs]);

  const onDelete = useCallback(() => {
    if (state.isUser && typeof window !== "undefined" && !window.confirm(`Delete "${state.presetName}"?`)) return;
    session.deleteCurrent();
  }, [session, state.isUser, state.presetName]);

  const onRandomAll = useCallback(() => {
    randomCount++;
    session.apply(randomize(host.values, ALL_GROUPS, 0.6), `RANDOM EVERYTHING #${randomCount}`);
  }, [host, session]);

  const cpu = meters ? meters.cpu * 100 : 0;
  const peak = meters ? Math.max(meters.peakL, meters.peakR) : 0;

  return (
    <header className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[3px] border border-zinc-800 bg-gradient-to-b from-zinc-900 to-black px-2 py-1">
      {/* logo */}
      <div className="flex min-w-0 items-center gap-1.5">
        <div
          aria-hidden
          className="grid h-7 w-7 shrink-0 place-items-center rounded-[4px] border border-violet-500 bg-gradient-to-br from-violet-600 to-fuchsia-900 text-[11px] font-black text-white shadow-[0_0_10px_rgba(168,85,247,0.6)]"
        >
          ∞
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-[13px] font-black uppercase leading-tight tracking-wide text-zinc-100">
            INSANITY XTREME PRO MAX ULTRA DELUXE <span className="text-violet-400">v∞</span>
          </h1>
          <p className="truncate text-[8px] leading-tight text-zinc-400">
            The World&apos;s Most Advanced Plugin That Definitely Does Everything™ (It Actually Works Edition)
          </p>
        </div>
      </div>

      {/* preset slot */}
      <div className="flex min-w-0 flex-1 items-center gap-1 rounded-[3px] border border-zinc-800 bg-black/60 px-1 py-0.5">
        <span className="text-[9px] font-bold uppercase text-zinc-500">PRESET:</span>
        <button type="button" title="Previous preset" onClick={() => session.step(-1)} className="px-0.5 text-[10px] text-zinc-400 hover:text-white">◀</button>
        <div className="min-w-0 flex-1" aria-live="polite">
          <div className="truncate font-mono text-[10px] font-bold uppercase text-amber-300" title={state.presetName}>{state.presetName}</div>
          {state.message ? <div className="truncate text-[8px] text-zinc-400">{state.message}</div> : null}
        </div>
        <button type="button" title="Next preset" onClick={() => session.step(1)} className="px-0.5 text-[10px] text-zinc-400 hover:text-white">▶</button>
        <ChunkyButton onClick={onLoad} title="Open the sound browser">LOAD</ChunkyButton>
        <ChunkyButton onClick={onSave} title={state.isUser ? "Overwrite this user preset" : "Save as a new user preset"}>SAVE</ChunkyButton>
        <ChunkyButton onClick={onSaveAs}>SAVE AS</ChunkyButton>
        <ChunkyButton onClick={onDelete} title="Delete the current user preset">DELETE</ChunkyButton>
      </div>

      <ChunkyButton onClick={onRandomAll} title="Randomize every group at 60% chaos (UNDO is in the Randomizer)">RANDOMIZE EVERYTHING</ChunkyButton>
      <ChunkyButton
        danger
        active={destroyOn}
        onClick={() => setDestroy(destroyOn ? 0 : 1)}
        title="Forces 8-voice unison on every active oscillator. It really does cost CPU."
        className={cn(destroyOn && "animate-pulse shadow-[0_0_14px_rgba(239,68,68,0.9)] from-red-500 to-red-800 text-white")}
      >
        {destroyOn ? "CPU DESTROYED" : "DESTROY CPU"}
      </ChunkyButton>

      {/* readout */}
      <div className="flex items-center gap-1.5 rounded-[3px] border border-zinc-800 bg-black/60 px-1.5 py-0.5">
        <div className="flex flex-col">
          <Readout label="CPU:" value={meters ? `${cpu.toFixed(1)}%` : "--"} warn={cpu > 70} />
          <Readout label="VOICES:" value={meters ? String(meters.voices) : "--"} />
        </div>
        <div className="flex flex-col">
          <Readout label="POLYPHONY:" value={String(Math.round(poly))} />
          <Readout label="ENGINE:" value={started ? "ON" : "OFF"} warn={!started} />
        </div>
        <MeterBar value={Math.min(1, cpu / 100)} className="h-6 w-1.5" color={cpu > 70 ? "#ef4444" : "#a855f7"} />
        <MeterBar value={peak} className="h-6 w-1.5" />
      </div>
    </header>
  );
}
