import { mkdtempSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { countedTokens } from "../src/accounting.js";
import { formatOtelApiRequest, otelRequestToUsageEvent, parseOtelPayload } from "../src/otel/parse.js";
import { printOtelEvents, readOtelFile } from "../src/otel/print.js";
import { startOtelReceiver } from "../src/otel/receiver.js";
import { UsageStore } from "../src/store.js";
import { otelFixture, otlpApiRequest } from "./fixtures/load.js";

describe("Claude Code OTel api_request parser", () => {
  it("extracts a normal API usage event from an OTLP logs payload", async () => {
    const events = await readOtelFile(otelFixture("api-request.json"));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      requestId: "req_011NORMAL",
      model: "claude-sonnet-4-6",
      inputTokens: 1200,
      outputTokens: 800,
      cacheReadTokens: 4000,
      cacheCreationTokens: 0,
      costUsd: 0.0123,
      timestamp: "2026-08-14T10:00:01.000Z",
      sessionId: "sess-otel-1",
    });
    const printed = formatOtelApiRequest(events[0]!);
    expect(printed).toContain("event.name claude_code.api_request");
    expect(printed).toContain("request_id req_011NORMAL");
    expect(printed).toContain("input_tokens 1200");
    expect(printed).toContain("cache_read_tokens 4000");
    expect(printed).toContain("timestamp/session_id 2026-08-14T10:00:01.000Z / sess-otel-1");
  });

  it("parses multiple requests in one session", () => {
    const payload = {
      resourceLogs: [
        {
          scopeLogs: [
            {
              logRecords: [
                logRecord({ request_id: "req_011A", input_tokens: 10, output_tokens: 2, "event.sequence": 1 }),
                logRecord({ request_id: "req_011B", input_tokens: 20, output_tokens: 3, "event.sequence": 2 }),
              ],
            },
          ],
        },
      ],
    };
    const parsed = parseOtelPayload(payload);
    expect(parsed.events.map((e) => e.requestId)).toEqual(["req_011A", "req_011B"]);
  });

  it("keeps duplicate request_id rows so ingest can ignore the second", () => {
    const payload = otlpApiRequest({ request_id: "req_011DUP", input_tokens: 5, output_tokens: 1 });
    const twice = parseOtelPayload([payload, payload]);
    expect(twice.events).toHaveLength(2);
    expect(twice.events[0]?.requestId).toBe("req_011DUP");
    const a = otelRequestToUsageEvent(twice.events[0]!, "otel");
    const b = otelRequestToUsageEvent(twice.events[1]!, "otel");
    expect(a?.id).toBe(b?.id);
    expect(a?.id).toBe("claude-otel:req_011DUP");
  });

  it("parses a zero-token event without inventing counts", () => {
    const parsed = parseOtelPayload(
      otlpApiRequest({ request_id: "req_011ZERO", input_tokens: 0, output_tokens: 0 }),
    );
    expect(parsed.events[0]?.inputTokens).toBe(0);
    expect(parsed.events[0]?.outputTokens).toBe(0);
    expect(otelRequestToUsageEvent(parsed.events[0]!, "otel")).toBeNull();
  });

  it("treats missing usage fields as missing, not zero", () => {
    const parsed = parseOtelPayload(
      otlpApiRequest({ request_id: "req_011MISS", model: "claude-sonnet-4-6" }),
    );
    expect(parsed.events[0]?.inputTokens).toBeNull();
    expect(parsed.events[0]?.outputTokens).toBeNull();
    expect(parsed.events[0]?.cacheReadTokens).toBeNull();
  });

  it("keeps cache read/write separate from input/output", () => {
    const parsed = parseOtelPayload(
      otlpApiRequest({
        request_id: "req_011CACHE",
        input_tokens: 200,
        output_tokens: 50,
        cache_read_tokens: 12000,
        cache_creation_tokens: 800,
      }),
    );
    const event = otelRequestToUsageEvent(parsed.events[0]!, "otel");
    expect(event?.cacheReadTokens).toBe(12000);
    expect(event?.cacheCreationTokens).toBe(800);
    expect(countedTokens(event!)).toBe(250);
  });

  it("skips malformed/unknown events instead of crashing", async () => {
    const parsed = parseOtelPayload({ nope: true });
    expect(parsed.events).toHaveLength(0);
    expect(await readOtelFile(otelFixture("malformed.json"))).toHaveLength(0);
    const other = parseOtelPayload({
      resourceLogs: [
        {
          scopeLogs: [
            {
              logRecords: [
                {
                  body: { stringValue: "claude_code.user_prompt" },
                  attributes: [{ key: "event.name", value: { stringValue: "user_prompt" } }],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(other.events).toHaveLength(0);
    expect(other.skipped).toBe(1);
    expect(parsed.malformed).toBeGreaterThanOrEqual(0);
  });

  it("re-reading the same event stream does not increase store totals", async () => {
    const file = otelFixture("stream-reread.jsonl");
    const first = await readOtelFile(file);
    const second = await readOtelFile(file);
    expect(first).toHaveLength(2);
    expect(second).toHaveLength(2);

    const store = new UsageStore(path.join(mkdtempSync(path.join(os.tmpdir(), "aqua-otel-")), "h.sqlite"));
    const events = first
      .map((row) => otelRequestToUsageEvent(row, file))
      .filter((row): row is NonNullable<typeof row> => row !== null);
    expect(store.ingest(events)).toMatchObject({ inserted: 1, ignored: 1 });
    expect(store.ingest(events)).toMatchObject({ inserted: 0, ignored: 2 });
    expect(store.countedTokenTotal()).toBe(15);
    store.close();
  });

  it("prints POC fields for a captured file", async () => {
    const text = printOtelEvents(await readOtelFile(otelFixture("api-request.json")));
    expect(text).toContain("request_id req_011NORMAL");
    expect(text).toContain("cost_usd 0.0123");
  });
});

describe("local OTLP receiver", () => {
  it("accepts one OTLP HTTP JSON api_request on loopback", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "aqua-otel-recv-"));
    const outPath = path.join(dir, "events.jsonl");
    const received: string[] = [];
    const receiver = await startOtelReceiver({
      host: "127.0.0.1",
      port: 0,
      outPath,
      onEvent: (event) => received.push(event.requestId ?? ""),
    });
    try {
      const payload = JSON.stringify(
        otlpApiRequest({ request_id: "req_011LIVE", input_tokens: 7, output_tokens: 3, model: "claude-sonnet-4-6" }),
      );
      const status = await postJson(receiver.url, payload);
      expect(status).toBe(200);
      expect(received).toEqual(["req_011LIVE"]);
      const saved = await readOtelFile(outPath);
      expect(saved[0]?.requestId).toBe("req_011LIVE");
      expect(saved[0]?.inputTokens).toBe(7);
      const rawLine = (await import("node:fs")).readFileSync(outPath, "utf8").trim();
      expect(rawLine).toContain('"event":"claude_code.api_request"');
      expect(rawLine).not.toMatch(/resourceLogs|prompt|tool_result/i);
    } finally {
      await receiver.close();
    }
  });
});

function logRecord(attributes: Record<string, unknown>): unknown {
  return {
    body: { stringValue: "claude_code.api_request" },
    attributes: Object.entries({
      "event.name": "api_request",
      "event.timestamp": "2026-08-14T10:00:01.000Z",
      "session.id": "sess-otel-1",
      model: "claude-sonnet-4-6",
      ...attributes,
    }).map(([key, value]) =>
      typeof value === "number"
        ? { key, value: { intValue: String(value) } }
        : { key, value: { stringValue: String(value) } },
    ),
  };
}

function postJson(url: string, body: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname,
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
        },
      },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode ?? 0));
      },
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}
