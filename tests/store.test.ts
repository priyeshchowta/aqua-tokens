import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { UsageStore } from "../src/store.js";
import { makeUsageEvent } from "../src/usage-event.js";
import type { UsageEvent } from "../src/types.js";

function event(id: string, tokens = 10): UsageEvent {
  return makeUsageEvent({
    id,
    platform: "claude-code",
    sessionId: "s",
    timestamp: 1,
    inputTokens: tokens,
    outputTokens: 0,
    source: "claude-jsonl",
    sourceFile: "test.jsonl",
  });
}

describe("UsageStore ingest", () => {
  it("inserts new events and ignores duplicates by stable id", () => {
    const store = new UsageStore(path.join(mkdtempSync(path.join(os.tmpdir(), "aqua-store-")), "h.sqlite"));
    expect(store.ingest([event("A", 10), event("B", 20)])).toEqual({
      inserted: 2,
      ignored: 0,
      skipped: 0,
    });
    expect(store.ingest([event("A", 10)])).toEqual({ inserted: 0, ignored: 1, skipped: 0 });
    expect(store.countedTokenTotal()).toBe(30);
    store.close();
  });

  it("does not increase totals when the same stream is reprocessed after restart", () => {
    const file = path.join(mkdtempSync(path.join(os.tmpdir(), "aqua-store-")), "h.sqlite");
    const first = new UsageStore(file);
    first.ingest([event("A", 10), event("B", 20)]);
    first.close();

    const second = new UsageStore(file);
    second.ingest([event("A", 10), event("B", 20), event("C", 5)]);
    expect(second.allEvents()).toHaveLength(3);
    expect(second.countedTokenTotal()).toBe(35);
    second.close();
  });

  it("skips zero-token events instead of storing them", () => {
    const store = new UsageStore(path.join(mkdtempSync(path.join(os.tmpdir(), "aqua-store-")), "h.sqlite"));
    expect(store.ingest([event("Z", 0)])).toEqual({ inserted: 0, ignored: 0, skipped: 1 });
    expect(store.allEvents()).toHaveLength(0);
    store.close();
  });

  it("does not let a duplicate rewrite token counts", () => {
    const store = new UsageStore(path.join(mkdtempSync(path.join(os.tmpdir(), "aqua-store-")), "h.sqlite"));
    store.ingest([event("A", 10)]);
    store.ingest([event("A", 999)]);
    expect(store.allEvents()[0]?.inputTokens).toBe(10);
    expect(store.countedTokenTotal()).toBe(10);
    store.close();
  });
});
