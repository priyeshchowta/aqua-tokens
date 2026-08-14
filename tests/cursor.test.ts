import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { UnrecognizedLogFormatError } from "../src/errors.js";
import { parseCursor, parseCursorDb, parseCursorTranscriptFile } from "../src/parsers/cursor.js";

const transcript = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/cursor/transcript.jsonl",
);

function makeDb(rows: Array<{ key: string; value: unknown }>): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "aqua-cursor-"));
  const dbPath = path.join(dir, "state.vscdb");
  const db = new DatabaseSync(dbPath);
  db.exec("CREATE TABLE cursorDiskKV (key TEXT PRIMARY KEY, value TEXT)");
  const insert = db.prepare("INSERT INTO cursorDiskKV (key, value) VALUES (?, ?)");
  for (const row of rows) {
    insert.run(row.key, typeof row.value === "string" ? row.value : JSON.stringify(row.value));
  }
  db.close();
  return dbPath;
}

describe("parseCursorDb", () => {
  it("reads tokenCount from composer bubbles", () => {
    const composerId = "comp-1";
    const dbPath = makeDb([
      {
        key: `composerData:${composerId}`,
        value: {
          composerId,
          createdAt: 1_700_000_000_000,
          lastUpdatedAt: 1_700_000_100_000,
          fullConversationHeadersOnly: [{ bubbleId: "b1" }, { bubbleId: "b2" }],
        },
      },
      {
        key: `bubbleId:${composerId}:b1`,
        value: {
          type: 2,
          createdAt: 1_700_000_000_000,
          tokenCount: { inputTokens: 400, outputTokens: 100 },
        },
      },
      {
        key: `bubbleId:${composerId}:b2`,
        value: { type: 1, createdAt: 1_700_000_050_000, text: "user" },
      },
    ]);

    const result = parseCursorDb(dbPath);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.inputTokens).toBe(400);
    expect(result.events[0]?.outputTokens).toBe(100);
    expect(result.events[0]?.sessionId).toBe(composerId);
  });

  it("fails when cursorDiskKV is missing", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "aqua-cursor-"));
    const dbPath = path.join(dir, "state.vscdb");
    const db = new DatabaseSync(dbPath);
    db.exec("CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value TEXT)");
    db.close();
    expect(() => parseCursorDb(dbPath)).toThrow(UnrecognizedLogFormatError);
  });

  it("reads tokenCount from bubbles listed under conversation[]", () => {
    const dbPath = makeDb([
      {
        key: "composerData:c2",
        value: { composerId: "c2", conversation: [{ bubbleId: "x" }] },
      },
      {
        key: "bubbleId:c2:x",
        value: { type: 2, tokenCount: { inputTokens: 20, outputTokens: 3 } },
      },
    ]);
    const result = parseCursorDb(dbPath);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.inputTokens + result.events[0]!.outputTokens).toBe(23);
  });

  it("still counts a bubble when composer headers are missing", () => {
    const dbPath = makeDb([
      {
        key: "composerData:orphan",
        value: { composerId: "orphan", createdAt: 1 },
      },
      {
        key: "bubbleId:orphan:z",
        value: { type: 2, createdAt: 2, tokenCount: { inputTokens: 7, outputTokens: 1 } },
      },
    ]);
    const result = parseCursorDb(dbPath);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.inputTokens).toBe(7);
  });

  it("fails when tokenCount is present but not the expected shape", () => {
    const dbPath = makeDb([
      {
        key: "composerData:c",
        value: { fullConversationHeadersOnly: [{ bubbleId: "b" }] },
      },
      {
        key: "bubbleId:c:b",
        value: { type: 2, tokenCount: { tokens: 99 } },
      },
    ]);
    expect(() => parseCursorDb(dbPath)).toThrow(/unrecognized log format, please open an issue/);
  });
});

describe("parseCursorTranscriptFile", () => {
  it("counts explicit usage on transcript lines and ignores lines without tokens", async () => {
    const events = await parseCursorTranscriptFile(transcript, "sess");
    expect(events).toHaveLength(1);
    expect(events[0]?.inputTokens).toBe(100);
    expect(events[0]?.outputTokens).toBe(50);
  });

  it("fails on unrecognized jsonl", async () => {
    const file = path.join(mkdtempSync(path.join(os.tmpdir(), "aqua-cursor-")), "x.jsonl");
    writeFileSync(file, `{"nope": true}\n`);
    await expect(parseCursorTranscriptFile(file)).rejects.toBeInstanceOf(UnrecognizedLogFormatError);
  });
});

describe("parseCursor", () => {
  it("does not double-count a transcript session already present in the DB", async () => {
    const composerId = "e8d46a70-3e14-4bda-a157-74970d3c21af";
    const dbPath = makeDb([
      {
        key: `composerData:${composerId}`,
        value: { fullConversationHeadersOnly: [{ bubbleId: "b1" }] },
      },
      {
        key: `bubbleId:${composerId}:b1`,
        value: { type: 2, tokenCount: { inputTokens: 10, outputTokens: 5 } },
      },
    ]);
    const root = mkdtempSync(path.join(os.tmpdir(), "aqua-cursor-proj-"));
    const dir = path.join(root, "proj", "agent-transcripts", composerId);
    const { mkdirSync } = await import("node:fs");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      path.join(dir, `${composerId}.jsonl`),
      `{"role":"assistant","usage":{"input_tokens":999,"output_tokens":999}}\n`,
    );

    const result = await parseCursor({ dbPaths: [dbPath], transcriptRoots: [root] });
    const tokens = result.events.reduce((n, e) => n + e.inputTokens + e.outputTokens, 0);
    expect(tokens).toBe(15);
  });
});
