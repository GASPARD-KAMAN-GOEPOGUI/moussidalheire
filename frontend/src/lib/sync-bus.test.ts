import { describe, expect, it } from "vitest";
import { notifyDataChanged, onDataChanged, type SyncMessage } from "./sync-bus";

describe("sync-bus", () => {
  it("delivers a message to a same-context listener", async () => {
    const received: SyncMessage[] = [];
    const unsubscribe = onDataChanged((msg) => received.push(msg));
    try {
      notifyDataChanged("personne", "abc-123");
      expect(received).toHaveLength(1);
      expect(received[0]).toMatchObject({ resource: "personne", id: "abc-123" });
    } finally {
      unsubscribe();
    }
  });

  it("stops delivering after unsubscribe", () => {
    const received: SyncMessage[] = [];
    const unsubscribe = onDataChanged((msg) => received.push(msg));
    unsubscribe();
    notifyDataChanged("famille", "xyz");
    expect(received).toHaveLength(0);
  });

  it("relays a message posted from another BroadcastChannel instance on the same channel", async () => {
    const received: SyncMessage[] = [];
    const unsubscribe = onDataChanged((msg) => received.push(msg));
    const otherTab = new BroadcastChannel("moussidalheire-sync");
    try {
      otherTab.postMessage({ resource: "actualite", id: "n1", at: Date.now() } satisfies SyncMessage);
      // BroadcastChannel delivery is asynchronous even within the same process.
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(received.some((m) => m.resource === "actualite" && m.id === "n1")).toBe(true);
    } finally {
      unsubscribe();
      otherTab.close();
    }
  });

  it("does not throw when notifying with no listeners registered", () => {
    expect(() => notifyDataChanged("lieu")).not.toThrow();
  });

  it("omits id when not provided", () => {
    const received: SyncMessage[] = [];
    const unsubscribe = onDataChanged((msg) => received.push(msg));
    try {
      notifyDataChanged("union");
      expect(received[0]?.id).toBeUndefined();
    } finally {
      unsubscribe();
    }
  });
});
