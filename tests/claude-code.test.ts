import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { UnrecognizedLogFormatError } from "../src/errors.js";
import { parseClaudeCode, parseClaudeFile } from "../src/parsers/claude-code.js";

const fixture = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/claude-code/session.jsonl",
);
const unrecognized = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/claude-code/unrecognized.jsonl",
);

describe("parseClaudeFile", () => {
  it("extracts input+output tokens and dedupes replayed message ids", async () => {
    const events = await parseClaudeFile(fixture);
    expect(events).toHaveLength(1);
    expect(events[0]?.inputTokens).toBe(1200);
    expect(events[0]?.outputTokens).toBe(800);
    expect(events[0]?.inputTokens + events[0]!.outputTokens).toBe(2000);
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
