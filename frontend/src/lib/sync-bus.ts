/**
 * Cross-tab (same browser only) data-change bus. Every mutating call in
 * `src/services/api/*.ts` calls `notifyDataChanged` once it succeeds; every
 * `useAsync`-driven screen (see `src/hooks/useAsync.ts`) re-subscribes and
 * refetches on any message — deliberately coarse (no per-resource filtering
 * at the consumer side), matching this codebase's existing village-scale
 * trade-offs (`services/api/families.ts`, `services/api/tree.ts`) rather than
 * threading fine-grained resource dependencies through every page.
 *
 * `BroadcastChannel.postMessage` never delivers back to the same channel
 * instance — same-tab listeners (e.g. a page reacting to its own edit) are
 * therefore called directly here, not just relayed through the channel.
 */

export interface SyncMessage {
  resource: string;
  id?: string;
  at: number;
}

type Listener = (msg: SyncMessage) => void;

const CHANNEL_NAME = "moussidalheire-sync";

const listeners = new Set<Listener>();

const channel: BroadcastChannel | null =
  typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL_NAME) : null;

if (channel) {
  channel.onmessage = (event: MessageEvent<SyncMessage>) => {
    for (const listener of listeners) listener(event.data);
  };
}

export function notifyDataChanged(resource: string, id?: string): void {
  const msg: SyncMessage = { resource, ...(id !== undefined ? { id } : {}), at: Date.now() };
  channel?.postMessage(msg);
  for (const listener of listeners) listener(msg);
}

export function onDataChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
