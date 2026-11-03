// Lazy, per-context loader for the Breezaphone aerophone-lead worklet module.
// Mirrors src/lib/bassic/ensureBassicWorklet.ts: a WeakMap keyed by the
// AudioContext caches the addModule() promise so repeated boots only fetch +
// compile the module once. On failure the entry is dropped so a later attempt
// can retry.

import { workletUrl } from "@/lib/workletUrl";

const loadedContexts = new WeakMap<BaseAudioContext, Promise<void>>();

export const BREEZAPHONE_PROCESSOR_NAME = "breezaphone-engine";

export async function ensureBreezaphoneWorklet(ctx: BaseAudioContext): Promise<void> {
  const existing = loadedContexts.get(ctx);
  if (existing) return existing;
  const p = ctx.audioWorklet
    .addModule(workletUrl("breezaphone-engine.js"))
    .catch((err) => {
      loadedContexts.delete(ctx);
      throw err;
    });
  loadedContexts.set(ctx, p);
  return p;
}
