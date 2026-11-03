"use client";

// INSANITY perf — choosing how to play.
//   <InputChooser onStart />  the start screen: pick MIDI keyboard or PC keyboard. Both start
//                             the audio engine (browsers only allow sound after a click).
//   <InputStatus />           a small chip that stays on screen afterwards: shows the connected
//                             MIDI device, offers a one-click connect, and toggles PC keys.
//
// MIDI detection: the engine probes the permission on load without prompting. If access was
// granted on an earlier visit it connects by itself, so a plugged-in keyboard just works and
// the chooser says so. Hot-plugged devices are picked up and announced.

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import type { MidiState } from "@/lib/insanity/perf/engine";
import { usePerf, useSignal } from "./PerformanceContext";

function useMidi(): MidiState {
  const perf = usePerf();
  useSignal(perf.midiSig);
  return perf.midi;
}

function midiLine(m: MidiState): string {
  const online = m.devices.filter((d) => !d.endsWith("(offline)"));
  if (m.permission === "unsupported") return "This browser has no Web MIDI. Try Chrome or Edge.";
  if (m.permission === "denied") return "MIDI access was blocked. Allow it in the site settings to use a keyboard.";
  if (m.enabled && online.length > 0) return `Detected: ${online.join(", ")}`;
  if (m.enabled) return "MIDI is on. Plug in a keyboard and it will connect automatically.";
  return "Your browser will ask once for MIDI access.";
}

const PC_KEYS = ["A", "W", "S", "E", "D", "F", "T", "G", "Y", "H", "U", "J", "K"];

export function InputChooser({ onStart, busy }: { onStart: () => Promise<void>; busy: boolean }): JSX.Element {
  const perf = usePerf();
  const m = useMidi();
  const midiReady = m.enabled && m.devices.some((d) => !d.endsWith("(offline)"));
  const midiBlocked = m.permission === "unsupported" || m.permission === "denied";

  const startMidi = async (): Promise<void> => {
    perf.setPcKeys(true);
    // Ask for MIDI inside the click so the permission prompt is allowed, then start audio.
    const midi = perf.enableMidi();
    await onStart();
    await midi;
  };
  const startPc = async (): Promise<void> => {
    perf.setPcKeys(true);
    await onStart();
  };

  return (
    <div className="grid w-full max-w-2xl gap-3 sm:grid-cols-2">
      <button
        type="button"
        disabled={busy || midiBlocked}
        onClick={() => void startMidi()}
        className={cn(
          "flex flex-col items-start gap-2 rounded-md border-2 p-4 text-left transition",
          midiReady
            ? "border-emerald-400 bg-emerald-950/60 shadow-[0_0_30px_rgba(52,211,153,0.35)] hover:bg-emerald-900/60"
            : "border-violet-500 bg-violet-950/50 hover:bg-violet-900/50",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        <span className="text-base font-black uppercase tracking-widest text-white">
          {midiReady ? "Play with MIDI keyboard ✓" : "Connect MIDI keyboard"}
        </span>
        <span className="text-xs text-zinc-300">{midiLine(m)}</span>
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">PC keys keep working too</span>
      </button>

      <button
        type="button"
        disabled={busy}
        onClick={() => void startPc()}
        className="flex flex-col items-start gap-2 rounded-md border-2 border-red-500 bg-red-950/50 p-4 text-left transition hover:bg-red-900/50 disabled:opacity-50"
      >
        <span className="text-base font-black uppercase tracking-widest text-white">Play with PC keyboard</span>
        <span className="flex flex-wrap gap-0.5">
          {PC_KEYS.map((k) => (
            <kbd key={k} className="min-w-5 rounded-[3px] border border-zinc-600 bg-zinc-800 px-1 text-center font-mono text-[10px] text-zinc-200">
              {k}
            </kbd>
          ))}
        </span>
        <span className="text-xs text-zinc-300">Z / X shift the octave, C / V change velocity.</span>
      </button>
    </div>
  );
}

export function InputStatus(): JSX.Element {
  const perf = usePerf();
  const m = useMidi();
  const online = m.devices.filter((d) => !d.endsWith("(offline)"));
  const [notice, setNotice] = useState<string | null>(null);

  // Brief "connected" notice when a keyboard is plugged in after load.
  useEffect(() => {
    if (!m.lastConnected) return;
    setNotice(`${m.lastConnected} connected`);
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [m.lastConnected]);

  const canConnect = !m.enabled && m.permission !== "unsupported" && m.permission !== "denied";
  return (
    <div className="fixed bottom-3 right-3 z-40 flex items-center gap-1.5 rounded-md border border-zinc-700 bg-black/85 px-2 py-1 text-[10px] uppercase tracking-wider text-zinc-300 shadow-lg backdrop-blur">
      {notice ? <span className="font-bold text-emerald-400">{notice}</span> : null}
      <span className={cn("h-2 w-2 rounded-full", online.length > 0 ? "bg-emerald-400 shadow-[0_0_6px_#34d399]" : "bg-zinc-600")} />
      {online.length > 0 ? (
        <span title={online.join(", ")} className="max-w-48 truncate">MIDI: {online.join(", ")}</span>
      ) : canConnect ? (
        <button type="button" onClick={() => void perf.enableMidi()} className="font-bold text-violet-300 hover:text-white">
          Connect MIDI
        </button>
      ) : (
        <span className="text-zinc-500">{m.enabled ? "MIDI: waiting for a device" : "No MIDI"}</span>
      )}
      <span className="text-zinc-700">|</span>
      <button
        type="button"
        aria-pressed={m.pcKeys}
        onClick={() => perf.setPcKeys(!m.pcKeys)}
        className={cn("font-bold", m.pcKeys ? "text-amber-300" : "text-zinc-500 line-through")}
        title="Play notes with the computer keyboard"
      >
        PC keys
      </button>
    </div>
  );
}
