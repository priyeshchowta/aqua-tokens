import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { countedTokens } from "../src/accounting.js";
import { UnrecognizedLogFormatError } from "../src/errors.js";
import { parseClaudeCode, parseClaudeFile } from "../src/parsers/claude-code.js";
import { claudeFixture } from "./fixtures/load.js";

const fixture = claudeFixture("session.jsonl");
const unrecognized = claudeFixture("unrecognized.jsonl");

describe("parseClaudeFile", () => {
  it("extracts input+output tokens and dedupes replayed message ids", async () => {
    const events = await parseClaudeFile(fixture);
    expect(events).toHaveLength(1);
    expect(events[0]?.inputTokens).toBe(1200);
    expect(events[0]?.outputTokens).toBe(800);
    expect(events[0]?.cacheReadTokens).toBe(4000);
    expect(countedTokens(events[0]!)).toBe(2000);
    expect(events[0]?.source).toBe("claude-jsonl");
  });

  it("skips synthetic assistant rows", async () => {
    const events = await parseClaudeFile(fixture);
    expect(events.every((e) => e.id !== "claude:msg_synth")).toBe(true);
  });

  it("fails loudly on an unrecognized schema", async () => {
    await expect(parseClaudeFile(unrecognized)).rejects.toBeInstanceOf(UnrecognizedLogFormatError);
    await expect(parseClaudeFile(unrecognized)).rejects.toThrow(/unrecognized log format, please open an issue/);
  });

  it("fails when usage token fields are not numbers", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "aqua-claude-"));
    const file = path.join(dir, "bad.jsonl");
    writeFileSync(
      file,
      JSON.stringify({
        type: "assistant",
        sessionId: "s",
        timestamp: "2026-08-14T00:00:00.000Z",
        message: { id: "m", model: "claude-sonnet-4-6", usage: { input_tokens: "lots", output_tokens: 1 } },
      }) + "\n",
    );
    await expect(parseClaudeFile(file)).rejects.toBeInstanceOf(UnrecognizedLogFormatError);
  });
});

describe("parseClaudeCode", () => {
  it("walks a projects tree of jsonl files", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "aqua-claude-root-"));
    const project = path.join(root, "my-project");
    mkdirSync(project);
    writeFileSync(path.join(project, "sess.jsonl"), `{"type":"assistant","sessionId":"s","timestamp":"2026-08-14T12:00:00.000Z","message":{"id":"x","model":"claude-sonnet-4-6","usage":{"input_tokens":10,"output_tokens":5}}}\n`);
    const result = await parseClaudeCode({ roots: [root] });
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.inputTokens + result.events[0]!.outputTokens).toBe(15);
  });
});

describe("Claude JSONL fixtures", () => {
  it("counts multiple requests in one session", async () => {
    const events = await parseClaudeFile(claudeFixture("multi-request.jsonl"));
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.requestId)).toEqual(["req_011A", "req_011B"]);
    expect(events.reduce((n, e) => n + countedTokens(e), 0)).toBe(300);
  });

  it("skips zero-token events", async () => {
    const events = await parseClaudeFile(claudeFixture("zero-token.jsonl"));
    expect(events).toHaveLength(0);
  });

  it("skips assistant rows with no usage object", async () => {
    const events = await parseClaudeFile(claudeFixture("missing-usage.jsonl"));
    expect(events).toHaveLength(0);
  });

  it("fails loud when usage is present but input/output fields are missing", async () => {
    await expect(parseClaudeFile(claudeFixture("missing-fields.jsonl"))).rejects.toBeInstanceOf(
      UnrecognizedLogFormatError,
    );
  });

  it("records cache fields without folding them into counted tokens", async () => {
    const events = await parseClaudeFile(claudeFixture("cache-fields.jsonl"));
    expect(events).toHaveLength(1);
    expect(events[0]?.cacheReadTokens).toBe(12000);
    expect(events[0]?.cacheCreationTokens).toBe(800);
    expect(countedTokens(events[0]!)).toBe(250);
  });
});
