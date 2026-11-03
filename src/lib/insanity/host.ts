// INSANITY — the page-side seam. Owns the AudioContext, the engine worklet node, the
// param store and note fan-out. Every panel talks to ONE InsanityHost (via
// useInsanityHost() in components/insanity/InsanityContext.tsx).
//
//   performance side (keyboard / MIDI / arp / seq / chords / tuning)
//        └── host.noteOn(id, freq, note, vel) ──┬── worklet voices
//                                               └── note listeners (instrument layers)
//   layers ──connect──▶ host.layerInput ──▶ worklet input 0 ──▶ bus ──▶ master ──▶ out
//
// Param writes: host.setParam(index, value) updates the store immediately (UI) and
// queues the value; queued values go to the worklet in one batch per animation frame.

import { INSANITY_PROCESSOR_NAME, INSANITY_WORKLET_FILE, type FromWorklet, type MeterReport, type ToWorklet } from "./protocol";
import { PARAMS, PARAM_COUNT, clampParam, defaultValues, paramIndex } from "./params";
import { workletUrl } from "@/lib/workletUrl";

export interface NoteListener {
  noteOn(id: number, freq: number, note: number, vel: number): void;
  noteOff(id: number): void;
  allNotesOff(): void;
}

type Unsub = () => void;

export class InsanityHost {
  /** Current real values for every param (index order). Read-only outside the host. */
  readonly values: Float32Array = defaultValues();
  ctx: AudioContext | null = null;
  node: AudioWorkletNode | null = null;
  /** Layers connect their outputs here. Created on start(). */
  layerInput: GainNode | null = null;
  started = false;
  lastMeters: MeterReport | null = null;

  private paramSubs = new Map<number, Set<() => void>>();
  private anySubs = new Set<() => void>();
  private meterSubs = new Set<(m: MeterReport) => void>();
  private startSubs = new Set<() => void>();
  private noteListeners = new Set<NoteListener>();
  private pending = new Map<number, number>();
  private rafId: number | null = null;
  private nextNoteId = 1;
  private starting: Promise<void> | null = null;

  // ---- lifecycle ---------------------------------------------------------
  /** Create the AudioContext + engine. Must be called from a user gesture. Idempotent. */
  start(): Promise<void> {
    if (this.starting) return this.starting;
    this.starting = (async () => {
      const ctx = new AudioContext({ latencyHint: "interactive" });
      await ctx.audioWorklet.addModule(workletUrl(INSANITY_WORKLET_FILE));
      const node = new AudioWorkletNode(ctx, INSANITY_PROCESSOR_NAME, {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        processorOptions: { values: Array.from(this.values) },
      });
      node.port.onmessage = (e: MessageEvent<FromWorklet>) => this.onWorkletMessage(e.data);
      const layerInput = ctx.createGain();
      layerInput.channelCount = 2;
      layerInput.connect(node);
      node.connect(ctx.destination);
      this.ctx = ctx;
      this.node = node;
      this.layerInput = layerInput;
      if (ctx.state !== "running") await ctx.resume();
      this.started = true;
      this.startSubs.forEach((f) => f());
    })().catch((err) => {
      this.starting = null;
      throw err;
    });
    return this.starting;
  }

  /** Runs `f` once the engine has started (immediately if it already has). */
  onStarted(f: () => void): Unsub {
    if (this.started) f();
    this.startSubs.add(f);
    return () => this.startSubs.delete(f);
  }

  dispose(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.node?.disconnect();
    void this.ctx?.close();
    this.ctx = null;
    this.node = null;
    this.started = false;
    this.starting = null;
  }

  // ---- params ------------------------------------------------------------
  get(index: number): number {
    return this.values[index];
  }
  getById(id: string): number {
    return this.values[paramIndex(id)];
  }

  setParam(index: number, value: number): void {
    const p = PARAMS[index];
    if (!p) return;
    const v = clampParam(p, value);
    if (this.values[index] === v) return;
    this.values[index] = v;
    if (p.target === "engine") this.queue(index, v);
    this.notify(index);
  }
  setById(id: string, value: number): void {
    this.setParam(paramIndex(id), value);
  }

  /** Replace every value (preset load / randomize / reset). One message, one notify pass. */
  setAll(values: ArrayLike<number>): void {
    for (let i = 0; i < PARAM_COUNT; i++) this.values[i] = clampParam(PARAMS[i], values[i] ?? PARAMS[i].def);
    this.pending.clear();
    this.post({ type: "setAll", values: this.values.slice() });
    for (const i of this.paramSubs.keys()) this.paramSubs.get(i)?.forEach((f) => f());
    this.anySubs.forEach((f) => f());
  }

  /** Subscribe to one param (for useSyncExternalStore). */
  subscribe(index: number, f: () => void): Unsub {
    let s = this.paramSubs.get(index);
    if (!s) this.paramSubs.set(index, (s = new Set()));
    s.add(f);
    return () => s!.delete(f);
  }
  /** Subscribe to any param change. */
  subscribeAny(f: () => void): Unsub {
    this.anySubs.add(f);
    return () => this.anySubs.delete(f);
  }

  // ---- notes -------------------------------------------------------------
  /** Allocate a unique note id. */
  newNoteId(): number {
    return this.nextNoteId++;
  }
  noteOn(id: number, freq: number, note: number, vel: number): void {
    this.post({ type: "noteOn", id, freq, note, vel });
    this.noteListeners.forEach((l) => l.noteOn(id, freq, note, vel));
  }
  noteOff(id: number): void {
    this.post({ type: "noteOff", id });
    this.noteListeners.forEach((l) => l.noteOff(id));
  }
  allNotesOff(): void {
    this.post({ type: "allNotesOff" });
    this.noteListeners.forEach((l) => l.allNotesOff());
  }
  panic(): void {
    this.post({ type: "panic" });
    this.noteListeners.forEach((l) => l.allNotesOff());
  }
  controller(name: "modwheel" | "aftertouch" | "pitchBend", value: number): void {
    this.post({ type: "controller", name, value });
  }
  addNoteListener(l: NoteListener): Unsub {
    this.noteListeners.add(l);
    return () => this.noteListeners.delete(l);
  }

  // ---- meters ------------------------------------------------------------
  onMeters(f: (m: MeterReport) => void): Unsub {
    this.meterSubs.add(f);
    return () => this.meterSubs.delete(f);
  }

  // ---- internals ---------------------------------------------------------
  private notify(index: number): void {
    this.paramSubs.get(index)?.forEach((f) => f());
    this.anySubs.forEach((f) => f());
  }
  private queue(index: number, v: number): void {
    this.pending.set(index, v);
    if (this.rafId === null && typeof requestAnimationFrame !== "undefined") {
      this.rafId = requestAnimationFrame(() => this.flush());
    }
  }
  private flush(): void {
    this.rafId = null;
    if (this.pending.size === 0) return;
    const idx = new Int32Array(this.pending.size);
    const val = new Float32Array(this.pending.size);
    let k = 0;
    for (const [i, v] of this.pending) {
      idx[k] = i;
      val[k] = v;
      k++;
    }
    this.pending.clear();
    this.post({ type: "params", idx, val });
  }
  private post(msg: ToWorklet): void {
    this.node?.port.postMessage(msg);
  }
  private onWorkletMessage(msg: FromWorklet): void {
    if (msg.type === "meters") {
      this.lastMeters = msg;
      this.meterSubs.forEach((f) => f(msg));
    } else if (msg.type === "error") {
      console.error("[insanity-engine]", msg.message);
    }
  }
}
