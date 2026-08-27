import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { countedTokens } from "../src/accounting.js";
import { buildReport } from "../src/aggregate.js";
import {
  otelRequestToUsageEvent,
  parseOtelPayload,
  toSanitizedApiRequestExport,
} from "../src/otel/parse.js";
import { readOtelFile, writeSanitizedApiRequest } from "../src/otel/print.js";
import { formatReport } from "../src/report.js";
import { UsageStore } from "../src/store.js";
import { loadMethodology } from "../src/water.js";
import { otelFixture } from "./fixtures/load.js";

/**
 * Full synthetic path: OTel fixture → UsageEvent → SQLite → aggregate → water → report.
 * Does not require a live Claude Code install, network, or the author's machine.
 */
describe("OTel → UsageEvent → SQLite → report (synthetic e2e)", () => {
  it("maps a fixture api_request through ingest and report with correct water + accounting", async () => {
    const raw = await readOtelFile(otelFixture("api-request.json"));
    expect(raw).toHaveLength(1);

    const usage = otelRequestToUsageEvent(raw[0]!, otelFixture("api-request.json"));
    expect(usage).not.toBeNull();
    expect(usage!.id).toBe("claude-otel:req_011NORMAL");
    expect(usage!.inputTokens).toBe(1200);
    expect(usage!.outputTokens).toBe(800);
    expect(usage!.cacheReadTokens).toBe(4000);
    expect(countedTokens(usage!)).toBe(2000); // cache excluded

    const dir = mkdtempSync(path.join(os.tmpdir(), "aqua-e2e-"));
    const storePath = path.join(dir, "history.sqlite");
    const store = new UsageStore(storePath);

    expect(store.ingest([usage!])).toEqual({ inserted: 1, ignored: 0, skipped: 0 });
    // Dedup: re-ingest identical source event
    expect(store.ingest([usage!])).toEqual({ inserted: 0, ignored: 1, skipped: 0 });
    expect(store.countedTokenTotal()).toBe(2000);

    const methodology = loadMethodology();
    const report = buildReport(store.allEvents(), {
      scope: "scope1plus2",
      methodology,
      now: Date.parse("2026-08-14T18:00:00"),
    });
    store.close();

    // 2000 tokens × 10–50 mL / 1000 = 20–100 mL
    expect(report.source).toBe("Claude Code");
    expect(report.lifetime.tokens).toBe(2000);
    expect(report.lifetime.inputTokens).toBe(1200);
    expect(report.lifetime.outputTokens).toBe(800);
    expect(report.lifetime.water.lowMl).toBe(20);
    expect(report.lifetime.water.highMl).toBe(100);
    expect(report.scopeLabel).toBe("scope-1+2");
    expect(report.caveat).toContain("30x+");
    expect(report.tokenAccounting).toContain("API-request input + output only");
    expect(report.tokenAccounting).toMatch(/cache/i);
    expect(report.citation).toContain("arxiv.org/abs/2304.03271");

    const text = formatReport(report);
    expect(text).toContain("scope-1+2");
    expect(text).toContain("API-request input + output only");
    expect(text).toMatch(/20.*100.*mL|20–100 mL/);
  });

  it("produces the same UsageEvent.id for the same source event (deterministic dedup)", async () => {
    const events = await readOtelFile(otelFixture("api-request.json"));
    const a = otelRequestToUsageEvent(events[0]!, "a.json");
    const b = otelRequestToUsageEvent(events[0]!, "b.json"); // different sourceFile must not change id
    expect(a?.id).toBe(b?.id);
    expect(a?.id).toBe("claude-otel:req_011NORMAL");

    const again = parseOtelPayload(JSON.parse(readFileSync(otelFixture("api-request.json"), "utf8")));
    const c = otelRequestToUsageEvent(again.events[0]!, "c.json");
    expect(c?.id).toBe("claude-otel:req_011NORMAL");
  });

  it("writes a sanitized export without prompts or raw OTLP envelopes", async () => {
    const events = await readOtelFile(otelFixture("api-request.json"));
    const sanitized = toSanitizedApiRequestExport(events[0]!);
    expect(sanitized).toEqual({
      event: "claude_code.api_request",
      request_id: "req_011NORMAL",
      client_request_id: null,
      model: "claude-sonnet-4-6",
      input_tokens: 1200,
      output_tokens: 800,
      cache_read_tokens: 4000,
      cache_creation_tokens: 0,
      cost_usd: 0.0123,
      timestamp: "2026-08-14T10:00:01.000Z",
      session_id: "sess-otel-1",
    });
    expect(JSON.stringify(sanitized)).not.toMatch(/resourceLogs|prompt|tool|body|password|api.?key/i);

    const out = path.join(mkdtempSync(path.join(os.tmpdir(), "aqua-export-")), "api-request.json");
    writeSanitizedApiRequest(out, events[0]!);
    const roundTrip = await readOtelFile(out);
    expect(roundTrip[0]?.requestId).toBe("req_011NORMAL");
    expect(roundTrip[0]?.inputTokens).toBe(1200);
  });
});
