"use client";

// INSANITY — one shared requestAnimationFrame loop for every live canvas on the page.
// Canvases register a draw callback with useFrame(); they read host.lastMeters / host.values
// directly, so meter traffic never causes React re-renders.

import { useEffect, useRef } from "react";

type FrameFn = (t: number) => void;

const callbacks = new Set<FrameFn>();
let rafId: number | null = null;

function tick(t: number): void {
  rafId = callbacks.size > 0 ? requestAnimationFrame(tick) : null;
  callbacks.forEach((f) => {
    try {
      f(t);
    } catch (err) {
      console.error("[insanity] frame callback", err);
    }
  });
}

/** Run `fn` every animation frame while mounted. The latest `fn` is always used. */
export function useFrame(fn: FrameFn): void {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const f: FrameFn = (t) => ref.current(t);
    callbacks.add(f);
    if (rafId === null && typeof requestAnimationFrame !== "undefined") rafId = requestAnimationFrame(tick);
    return () => {
      callbacks.delete(f);
    };
  }, []);
}

/**
 * Size a canvas's backing store to its CSS box × devicePixelRatio and return a 2D context
 * scaled so drawing uses CSS pixels. Returns null when the canvas has no size yet.
 */
export function fitCanvas(canvas: HTMLCanvasElement | null): { g: CanvasRenderingContext2D; w: number; h: number } | null {
  if (!canvas) return null;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w === 0 || h === 0) return null;
  const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
  const bw = Math.round(w * dpr);
  const bh = Math.round(h * dpr);
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
  const g = canvas.getContext("2d");
  if (!g) return null;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { g, w, h };
}
