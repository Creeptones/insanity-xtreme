// Lazy, per-context loader for the exciton-transport worklet module.
// Mirrors src/lib/poles/ensureResonatorWorklet.ts: a WeakMap keyed by the
// AudioContext caches the addModule() promise so repeated boots (or multiple
// nodes on the same context) only fetch+compile the module once. On failure
// the entry is dropped so a later attempt can retry.

import { workletUrl } from "@/lib/workletUrl";

const loadedContexts = new WeakMap<BaseAudioContext, Promise<void>>();

export const EXCITON_PROCESSOR_NAME = "exciton-engine";

export async function ensureExcitonWorklet(ctx: BaseAudioContext): Promise<void> {
  const existing = loadedContexts.get(ctx);
  if (existing) return existing;
  const p = ctx.audioWorklet
    .addModule(workletUrl("exciton-engine.js"))
    .catch((err) => {
      loadedContexts.delete(ctx);
      throw err;
    });
  loadedContexts.set(ctx, p);
  return p;
}
