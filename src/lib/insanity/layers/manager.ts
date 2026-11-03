// INSANITY — layer manager. One per InsanityHost (getLayerManager(host)).
//
// Watches layer.<id>.on/level/a/b/c/d through host.subscribe, lazily loads a layer
// the first time it is switched on (only once the engine has started), connects it
// to host.layerInput, and forwards notes to every live layer through one
// NoteListener. Switching a layer off panics it and disconnects its output; the
// engine instance is kept so switching back on never re-creates running processors.
//
// A failed load is caught and reported as status "failed"; the page keeps working.
// Main-thread-only state (the Braids model) also lives here.

import type { InsanityHost, NoteListener } from "../host";
import { LAYER_IDS, paramIndex, type LayerId } from "../params";
import { BraidsLayer, type BraidsModelId } from "./braidsLayer";
import { BreezaphoneLayer, ExcitonLayer } from "./messageLayers";
import { PollenLayer } from "./pollenLayer";
import type { LayerControls, LayerEngine, LayerStatus } from "./types";

type Unsub = () => void;

interface Slot {
  engine: LayerEngine | null;
  /** The AudioContext the engine was built on (a disposed + restarted host gets a new one). */
  ctx: AudioContext | null;
  loading: Promise<LayerEngine | null> | null;
  connected: boolean;
  status: LayerStatus;
  error: string | null;
}

export class LayerManager {
  private slots = new Map<LayerId, Slot>();
  private subs = new Set<() => void>();
  private unsubs: Unsub[] = [];
  private attached = 0;
  private braidsModel: BraidsModelId = "pluck";

  constructor(private host: InsanityHost) {
    for (const id of LAYER_IDS) this.slots.set(id, { engine: null, ctx: null, loading: null, connected: false, status: "off", error: null });
  }

  // ---- React-facing store ----------------------------------------------------
  subscribe = (f: () => void): Unsub => {
    this.subs.add(f);
    return () => this.subs.delete(f);
  };
  status(id: LayerId): LayerStatus {
    return this.slots.get(id)?.status ?? "off";
  }
  error(id: LayerId): string | null {
    return this.slots.get(id)?.error ?? null;
  }
  getBraidsModel = (): BraidsModelId => this.braidsModel;
  setBraidsModel(m: BraidsModelId): void {
    if (m === this.braidsModel) return;
    this.braidsModel = m;
    const e = this.slots.get("braids")?.engine;
    if (e instanceof BraidsLayer) e.setModel(m);
    this.emit();
  }
  private emit(): void {
    this.subs.forEach((f) => f());
  }
  private setStatus(id: LayerId, status: LayerStatus, error: string | null = null): void {
    const s = this.slots.get(id);
    if (!s || (s.status === status && s.error === error)) return;
    s.status = status;
    s.error = error;
    this.emit();
  }

  // ---- lifecycle --------------------------------------------------------------
  /** Start watching params and notes. Ref-counted; returns the matching detach. */
  attach(): Unsub {
    this.attached++;
    if (this.attached === 1) this.bind();
    return () => {
      this.attached--;
      if (this.attached === 0) this.unbind();
    };
  }

  private bind(): void {
    const host = this.host;
    const listener: NoteListener = {
      noteOn: (id, freq, note, vel) => this.each((e) => e.noteOn(id, freq, note, vel)),
      noteOff: (id) => this.each((e) => e.noteOff(id)),
      allNotesOff: () => this.each((e) => e.allNotesOff()),
    };
    this.unsubs.push(host.addNoteListener(listener));
    for (const id of LAYER_IDS) {
      this.unsubs.push(host.subscribe(paramIndex(`layer.${id}.on`), () => this.sync(id)));
      for (const k of ["level", "a", "b", "c", "d"] as const) {
        this.unsubs.push(host.subscribe(paramIndex(`layer.${id}.${k}`), () => this.pushControls(id)));
      }
    }
    this.unsubs.push(host.onStarted(() => LAYER_IDS.forEach((id) => this.sync(id))));
    LAYER_IDS.forEach((id) => this.sync(id));
  }

  private unbind(): void {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    for (const id of LAYER_IDS) this.disconnect(id);
  }

  private each(f: (e: LayerEngine) => void): void {
    for (const s of this.slots.values()) {
      if (!s.engine || !s.connected) continue;
      try {
        f(s.engine);
      } catch (err) {
        console.warn("[insanity] layer note failed", err);
      }
    }
  }

  private controls(id: LayerId): LayerControls {
    const v = (k: string): number => this.host.values[paramIndex(`layer.${id}.${k}`)];
    return { level: v("level"), a: v("a"), b: v("b"), c: v("c"), d: v("d") };
  }

  private pushControls(id: LayerId): void {
    const e = this.slots.get(id)?.engine;
    if (!e) return;
    try {
      e.setControls(this.controls(id));
    } catch (err) {
      console.warn("[insanity] layer control failed", err);
    }
  }

  private wantOn(id: LayerId): boolean {
    return this.host.values[paramIndex(`layer.${id}.on`)] >= 0.5;
  }

  /** Bring a layer in line with its `on` param. */
  private sync(id: LayerId): void {
    const s = this.slots.get(id);
    if (!s) return;
    if (!this.wantOn(id)) {
      this.disconnect(id);
      this.setStatus(id, "off");
      return;
    }
    const host = this.host;
    if (!host.started || !host.ctx || !host.layerInput) {
      this.setStatus(id, "standby");
      return;
    }
    if (s.engine && s.ctx !== host.ctx) {
      s.engine = null;
      s.connected = false;
    }
    if (s.engine) {
      this.connect(id);
      return;
    }
    if (s.loading) return;
    this.setStatus(id, "loading");
    const ctx = host.ctx;
    s.loading = this.create(id, ctx)
      .then((engine) => {
        s.engine = engine;
        s.ctx = ctx;
        s.loading = null;
        this.pushControls(id);
        if (this.wantOn(id) && this.attached > 0) this.connect(id);
        else this.setStatus(id, "off");
        return engine;
      })
      .catch((err: unknown) => {
        s.loading = null;
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[insanity] layer ${id} failed to load`, err);
        this.setStatus(id, "failed", msg);
        return null;
      });
  }

  private create(id: LayerId, ctx: AudioContext): Promise<LayerEngine> {
    switch (id) {
      case "braids": return BraidsLayer.create(ctx, this.braidsModel);
      case "breezaphone": return BreezaphoneLayer.create(ctx);
      case "pollen": return PollenLayer.create(ctx);
      case "exciton": return ExcitonLayer.create(ctx);
    }
  }

  private connect(id: LayerId): void {
    const s = this.slots.get(id);
    const dest = this.host.layerInput;
    if (!s?.engine || !dest) return;
    if (!s.connected) {
      try {
        s.engine.output.connect(dest);
        s.connected = true;
      } catch (err) {
        this.setStatus(id, "failed", err instanceof Error ? err.message : String(err));
        return;
      }
    }
    this.setStatus(id, "on");
  }

  private disconnect(id: LayerId): void {
    const s = this.slots.get(id);
    if (!s?.engine || !s.connected) return;
    try {
      s.engine.panic();
      s.engine.output.disconnect();
    } catch {
      /* already gone */
    }
    s.connected = false;
  }

  /** Retry a failed layer. */
  retry(id: LayerId): void {
    if (this.slots.get(id)?.status === "failed") {
      this.setStatus(id, "off");
      this.sync(id);
    }
  }
}

const managers = new WeakMap<InsanityHost, LayerManager>();
export function getLayerManager(host: InsanityHost): LayerManager {
  let m = managers.get(host);
  if (!m) managers.set(host, (m = new LayerManager(host)));
  return m;
}
