import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildReport, startOfLocalDay } from "../src/aggregate.js";
import { formatReport } from "../src/report.js";
import { UsageStore } from "../src/store.js";
import { makeUsageEvent } from "../src/usage-event.js";
import type { UsageEvent } from "../src/types.js";
import { loadMethodology } from "../src/water.js";

const methodology = loadMethodology();

function event(
  partial: Partial<UsageEvent> & Pick<UsageEvent, "id" | "timestamp" | "inputTokens" | "outputTokens">,
): UsageEvent {
  return makeUsageEvent({
    platform: "claude-code",
    sessionId: "s",
    sourceFile: "test",
    source: "claude-jsonl",
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    ...partial,
  });
}

describe("buildReport", () => {
  it("splits today / week / all-time and always includes caveat + citation", () => {
    const now = Date.parse("2026-08-14T18:00:00");
    const today = startOfLocalDay(now) + 60_000;
    const lastWeek = today - 8 * 24 * 60 * 60 * 1000;

    const events: UsageEvent[] = [
      event({ id: "1", timestamp: today, inputTokens: 900, outputTokens: 100 }),
      event({ id: "2", timestamp: lastWeek, inputTokens: 4000, outputTokens: 1000 }),
    ];

    const report = buildReport(events, { scope: "scope1plus2", methodology, now });
    expect(report.source).toBe("Claude Code");
    expect(report.lifetime.tokens).toBe(6000);
    expect(report.lifetime.water.lowMl).toBe(60);
    expect(report.lifetime.water.highMl).toBe(300);
    expect(report.caveat).toContain("30x+");
    expect(report.citation).toContain("arxiv.org/abs/2304.03271");

    const todayRow = report.rows.find((r) => r.period === "today");
    const weekRow = report.rows.find((r) => r.period === "week");
    const allRow = report.rows.find((r) => r.period === "all");
    expect(todayRow?.tokens).toBe(1000);
    expect(weekRow?.tokens).toBe(1000);
    expect(allRow?.tokens).toBe(6000);

    const text = formatReport(report);
    expect(text).toContain("Source: Claude Code");
    expect(text).not.toMatch(/Cursor/i);
    expect(text).toContain("scope-1+2");
    expect(text).toContain("30x+");
    expect(text).toContain("arxiv.org/abs/2304.03271");
    expect(text).toContain("per-machine");
    expect(text).toMatch(/Lifetime: .* tokens · .* mL, scope-1\+2/);
    expect(text).toContain("API-request input + output only");
    expect(text).toContain("cache tokens excluded from this estimate");
  });

  it("supports scope-1 range", () => {
    const events: UsageEvent[] = [
      event({ id: "1", timestamp: 1, inputTokens: 1000, outputTokens: 0 }),
    ];
    const report = buildReport(events, { scope: "scope1", methodology });
    expect(report.scopeLabel).toBe("scope-1");
    expect(report.lifetime.water.lowMl).toBeCloseTo(0.26);
    expect(report.lifetime.water.highMl).toBeCloseTo(0.32);
  });
});

describe("UsageStore", () => {
  it("round-trips events through sqlite", () => {
    const file = path.join(mkdtempSync(path.join(os.tmpdir(), "aqua-store-")), "history.sqlite");
    const store = new UsageStore(file);
    const events: UsageEvent[] = [
      event({
        id: "a",
        timestamp: 1,
        inputTokens: 2,
        outputTokens: 3,
        sessionId: "s1",
        sourceFile: "/tmp/a.jsonl",
      }),
    ];
    store.replaceAll(events);
    const roundTripped = store.allEvents();
    expect(roundTripped).toHaveLength(1);
    expect(roundTripped[0]?.id).toBe("a");
    expect(roundTripped[0]?.inputTokens).toBe(2);
    expect(roundTripped[0]?.outputTokens).toBe(3);
    expect(roundTripped[0]?.source).toBe("claude-jsonl");
    store.close();
  });
});
