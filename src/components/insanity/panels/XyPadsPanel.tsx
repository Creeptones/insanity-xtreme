"use client";

import { memo, useCallback, useRef, type KeyboardEvent, type PointerEvent } from "react";
import { XY_COUNT } from "@/lib/insanity/params";
import { Section } from "../InsanityPrimitives";
import { useParam } from "../InsanityContext";

const XyPad = memo(function XyPad({ i }: { i: number }): JSX.Element {
  const [x, setX] = useParam(`xy${i}.x`);
  const [y, setY] = useParam(`xy${i}.y`);
  const dragging = useRef(false);

  const apply = useCallback((e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    setX(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
    setY(Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height)));
  }, [setX, setY]);
  const onDown = useCallback((e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
    apply(e);
  }, [apply]);
  const onMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (dragging.current) apply(e);
  }, [apply]);
  const onUp = useCallback(() => { dragging.current = false; }, []);
  const onKey = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    const s = e.shiftKey ? 0.01 : 0.05;
    if (e.key === "ArrowLeft") setX(Math.max(0, x - s));
    else if (e.key === "ArrowRight") setX(Math.min(1, x + s));
    else if (e.key === "ArrowUp") setY(Math.min(1, y + s));
    else if (e.key === "ArrowDown") setY(Math.max(0, y - s));
    else return;
    e.preventDefault();
  }, [x, y, setX, setY]);

  return (
    <div className="flex min-w-0 flex-col gap-px">
      <div className="text-center text-[7px] font-bold uppercase tracking-wider text-violet-300">XY {i}</div>
      <div
        role="slider"
        tabIndex={0}
        aria-label={`XY pad ${i}`}
        aria-valuetext={`x ${x.toFixed(2)}, y ${y.toFixed(2)}`}
        aria-valuenow={Math.round(x * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        title={`XY ${i}: drag (mod sources xy${i}.x / xy${i}.y)`}
        className="relative aspect-square w-full cursor-crosshair touch-none overflow-hidden rounded-[2px] border border-violet-950 outline-none focus-visible:ring-1 focus-visible:ring-violet-300"
        style={{ background: "radial-gradient(circle at 50% 50%, #4c1d95 0%, #2e1065 55%, #0c0a1a 100%)" }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onDoubleClick={() => { setX(0.5); setY(0.5); }}
        onKeyDown={onKey}
      >
        <div className="pointer-events-none absolute inset-y-0 w-px bg-violet-400/30" style={{ left: `${x * 100}%` }} />
        <div className="pointer-events-none absolute inset-x-0 h-px bg-violet-400/30" style={{ top: `${(1 - y) * 100}%` }} />
        <div
          className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-200"
          style={{ left: `${x * 100}%`, top: `${(1 - y) * 100}%`, boxShadow: "0 0 6px #c4b5fd" }}
        />
      </div>
    </div>
  );
});

/** "XY PADS (16x)": 16 draggable pads bound to xy{i}.x / xy{i}.y. */
export const XyPadsPanel = memo(function XyPadsPanel(): JSX.Element {
  return (
    <Section title="XY Pads" badge="(16x)" bodyClassName="grid grid-cols-8 gap-1 max-lg:grid-cols-4 max-lg:gap-2">
      {Array.from({ length: XY_COUNT }, (_, k) => (
        <XyPad key={k} i={k + 1} />
      ))}
    </Section>
  );
});
