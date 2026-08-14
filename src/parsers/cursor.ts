import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { UnrecognizedLogFormatError } from "../errors.js";
import { asNonNegInt, isPlainObject, readJsonl } from "../jsonl.js";
import { cursorAgentTranscriptDir, cursorStateDbCandidates } from "../paths.js";
import { makeUsageEvent } from "../usage-event.js";
import type { ParseResult, ParseWarning, UsageEvent } from "../types.js";

export const CURSOR_BILLED_USAGE_UNAVAILABLE =
  "Cursor local billed usage is unavailable. A zero Cursor total is not proof that no usage occurred — Cursor does not persist billed input/output locally on current desktop builds. Refusing to guess from character counts or from context-window fields (contextTokensUsed, promptTokenBreakdown).";

export const CURSOR_TOKENCOUNT_ALWAYS_ZERO =
  "Cursor local DB was readable and tokenCount was present, but every stored value was 0. That is not proof that no usage occurred. Local billed Cursor tokens are unavailable; do not treat this total as a Cursor usage UI figure.";

export interface CursorParseOptions {
  dbPaths?: string[];
  transcriptRoots?: string[];
}

export async function parseCursor(options: CursorParseOptions = {}): Promise<ParseResult> {
  const warnings: ParseWarning[] = [];
  const events: UsageEvent[] = [];
  const sessionsWithDbTokens = new Set<string>();

  const dbPaths = (options.dbPaths ?? cursorStateDbCandidates()).filter((p) => existsSync(p));
  for (const dbPath of dbPaths) {
    const parsed = parseCursorDb(dbPath);
    events.push(...parsed.events);
    warnings.push(...parsed.warnings);
    for (const event of parsed.events) sessionsWithDbTokens.add(event.sessionId);
  }

  const transcriptRoot = options.transcriptRoots?.[0] ?? cursorAgentTranscriptDir();
  const extraRoots = options.transcriptRoots ?? [transcriptRoot];
  for (const root of extraRoots) {
    if (!(await dirExists(root))) continue;
    const jsonlEvents = await parseCursorTranscripts(root, sessionsWithDbTokens);
    events.push(...jsonlEvents.events);
    warnings.push(...jsonlEvents.warnings);
  }

  if (dbPaths.length > 0) {
    const dbTokenEvents = events.filter((e) => e.sourceFile.endsWith("state.vscdb"));
    if (dbTokenEvents.length === 0 && !warnings.some((w) => w.platform === "cursor")) {
      warnings.push({
        platform: "cursor",
        message: CURSOR_BILLED_USAGE_UNAVAILABLE,
      });
    }
  }

  return { events, warnings };
}

export function parseCursorDb(dbPath: string): ParseResult {
  const snapshot = snapshotSqlite(dbPath);
  try {
    return readCursorSnapshot(snapshot.path, dbPath);
  } finally {
    snapshot.cleanup();
  }
}

function snapshotSqlite(dbPath: string): { path: string; cleanup: () => void } {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "aqua-tokens-cursor-"));
  const base = path.basename(dbPath);
  const dest = path.join(tmp, base);
  copyFileSync(dbPath, dest);
  for (const suffix of ["-wal", "-shm"] as const) {
    const side = dbPath + suffix;
    if (existsSync(side)) copyFileSync(side, dest + suffix);
  }
  return {
    path: dest,
    cleanup: () => {
      try {
        rmSync(tmp, { recursive: true, force: true });
      } catch {
        // ignore
      }
    },
  };
}

function readCursorSnapshot(snapshotPath: string, originalPath: string): ParseResult {
  let db: DatabaseSync;
  try {
    db = new DatabaseSync(snapshotPath, { readOnly: true });
  } catch (err) {
    throw new UnrecognizedLogFormatError(
      originalPath,
      err instanceof Error ? err.message : "could not open SQLite database",
    );
  }

  try {
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`)
      .all() as Array<{ name: string }>;
    const names = new Set(tables.map((t) => t.name));
    if (!names.has("cursorDiskKV")) {
      throw new UnrecognizedLogFormatError(
        originalPath,
        "expected cursorDiskKV table is missing",
      );
    }

    const composerRows = db
      .prepare(`SELECT key, value FROM cursorDiskKV WHERE key LIKE 'composerData:%'`)
      .all() as Array<{ key: unknown; value: unknown }>;

    const events: UsageEvent[] = [];
    const seen = new Set<string>();
    const warnings: ParseWarning[] = [];
    let tokenCountPresent = 0;
    let tokenCountNonZero = 0;
    const getBubble = db.prepare(`SELECT value FROM cursorDiskKV WHERE key = ?`);

    for (const row of composerRows) {
      const key = sqliteText(row.key);
      if (!key.startsWith("composerData:")) {
        throw new UnrecognizedLogFormatError(originalPath, `unexpected composer key ${key}`);
      }
      const composerId = key.slice("composerData:".length);
      const composer = parseJsonObject(row.value, originalPath, key);
      if (!looksLikeComposer(composer)) {
        throw new UnrecognizedLogFormatError(originalPath, `unrecognized composerData schema for ${key}`);
      }

      for (const bubbleId of bubbleIdsFromComposer(composer)) {
        const bubbleKey = `bubbleId:${composerId}:${bubbleId}`;
        const bubbleRow = getBubble.get(bubbleKey) as { value: unknown } | undefined;
        if (!bubbleRow) continue;
        const extracted = eventFromBubble(
          bubbleRow.value,
          originalPath,
          bubbleKey,
          composerId,
          bubbleId,
          composer.lastUpdatedAt ?? composer.createdAt,
        );
        if (extracted.tokenCountPresent) tokenCountPresent += 1;
        if (extracted.event) {
          tokenCountNonZero += 1;
          seen.add(extracted.event.id);
          events.push(extracted.event);
        } else {
          seen.add(`cursor:${composerId}:${bubbleId}`);
        }
      }
    }

    const bubbleRows = db
      .prepare(`SELECT key, value FROM cursorDiskKV WHERE key LIKE 'bubbleId:%'`)
      .all() as Array<{ key: unknown; value: unknown }>;
    for (const row of bubbleRows) {
      const key = sqliteText(row.key);
      const parsedKey = parseBubbleKey(key);
      if (!parsedKey) {
        throw new UnrecognizedLogFormatError(originalPath, `unexpected bubble key ${key}`);
      }
      const id = `cursor:${parsedKey.composerId}:${parsedKey.bubbleId}`;
      if (seen.has(id)) continue;
      const extracted = eventFromBubble(
        row.value,
        originalPath,
        key,
        parsedKey.composerId,
        parsedKey.bubbleId,
        undefined,
      );
      if (extracted.tokenCountPresent) tokenCountPresent += 1;
      if (!extracted.event) continue;
      tokenCountNonZero += 1;
      events.push(extracted.event);
    }

    if (tokenCountPresent > 0 && tokenCountNonZero === 0) {
      warnings.push({ platform: "cursor", message: CURSOR_TOKENCOUNT_ALWAYS_ZERO });
    }

    return { events, warnings };
  } finally {
    db.close();
  }
}

function looksLikeComposer(obj: Record<string, unknown>): boolean {
  return (
    Array.isArray(obj.fullConversationHeadersOnly) ||
    Array.isArray(obj.conversation) ||
    typeof obj.composerId === "string" ||
    obj.createdAt !== undefined ||
    obj.lastUpdatedAt !== undefined
  );
}

function bubbleIdsFromComposer(composer: Record<string, unknown>): string[] {
  const ids: string[] = [];
  for (const list of [composer.fullConversationHeadersOnly, composer.conversation]) {
    if (!Array.isArray(list)) continue;
    for (const header of list) {
      const id = bubbleIdFromHeader(header);
      if (id) ids.push(id);
    }
  }
  return ids;
}

function parseBubbleKey(key: string): { composerId: string; bubbleId: string } | null {
  const match = /^bubbleId:([^:]+):(.+)$/.exec(key);
  if (!match) return null;
  return { composerId: match[1]!, bubbleId: match[2]! };
}

function eventFromBubble(
  value: unknown,
  originalPath: string,
  bubbleKey: string,
  composerId: string,
  bubbleId: string,
  fallbackTs: unknown,
): { event: UsageEvent | null; tokenCountPresent: boolean } {
  const bubble = parseJsonObject(value, originalPath, bubbleKey);
  if (!looksLikeBubble(bubble)) return { event: null, tokenCountPresent: false };
  const tokens = extractBubbleTokens(bubble, originalPath, bubbleKey);
  if (!tokens) return { event: null, tokenCountPresent: false };
  if (tokens.input === 0 && tokens.output === 0) {
    return { event: null, tokenCountPresent: true };
  }
  return {
    tokenCountPresent: true,
    event: makeUsageEvent({
      id: `cursor:${composerId}:${bubbleId}`,
      platform: "cursor",
      sessionId: composerId,
      timestamp: parseCursorTimestamp(bubble.createdAt ?? fallbackTs),
      inputTokens: tokens.input,
      outputTokens: tokens.output,
      source: "cursor-db",
      sourceFile: originalPath,
    }),
  };
}

function looksLikeBubble(obj: Record<string, unknown>): boolean {
  return (
    obj.type !== undefined ||
    typeof obj.text === "string" ||
    obj.tokenCount !== undefined ||
    obj.createdAt !== undefined ||
    obj.richText !== undefined
  );
}

function bubbleIdFromHeader(header: unknown): string | null {
  if (typeof header === "string") return header;
  if (!isPlainObject(header)) return null;
  if (typeof header.bubbleId === "string") return header.bubbleId;
  return null;
}

function extractBubbleTokens(
  bubble: Record<string, unknown>,
  filePath: string,
  key: string,
): { input: number; output: number } | null {
  if (bubble.tokenCount === undefined || bubble.tokenCount === null) {
    return extractUsageObject(bubble.usage, filePath, key);
  }
  if (!isPlainObject(bubble.tokenCount)) {
    throw new UnrecognizedLogFormatError(filePath, `${key} tokenCount is not an object`);
  }
  const tc = bubble.tokenCount;
  const inputRaw = tc.inputTokens ?? tc.input_tokens;
  const outputRaw = tc.outputTokens ?? tc.output_tokens;
  if (inputRaw === undefined && outputRaw === undefined) {
    throw new UnrecognizedLogFormatError(
      filePath,
      `${key} tokenCount is missing inputTokens/outputTokens`,
    );
  }
  const input = asNonNegInt(inputRaw);
  const output = asNonNegInt(outputRaw);
  if (input === null || output === null) {
    throw new UnrecognizedLogFormatError(
      filePath,
      `${key} tokenCount is missing numeric inputTokens/outputTokens`,
    );
  }
  return { input, output };
}

function extractUsageObject(
  usage: unknown,
  filePath: string,
  key: string,
): { input: number; output: number } | null {
  if (usage === undefined || usage === null) return null;
  if (!isPlainObject(usage)) {
    throw new UnrecognizedLogFormatError(filePath, `${key} usage is not an object`);
  }
  const inputRaw = usage.inputTokens ?? usage.input_tokens ?? usage.prompt_tokens;
  const outputRaw = usage.outputTokens ?? usage.output_tokens ?? usage.completion_tokens;
  if (inputRaw === undefined && outputRaw === undefined) {
    throw new UnrecognizedLogFormatError(filePath, `${key} usage has no recognized token fields`);
  }
  const input = asNonNegInt(inputRaw);
  const output = asNonNegInt(outputRaw);
  if (input === null || output === null) {
    throw new UnrecognizedLogFormatError(filePath, `${key} usage has non-numeric token fields`);
  }
  if (input === 0 && output === 0) return null;
  return { input, output };
}

async function parseCursorTranscripts(
  root: string,
  skipSessions: Set<string>,
): Promise<ParseResult> {
  const files = await collectJsonl(root);
  const events: UsageEvent[] = [];
  const warnings: ParseWarning[] = [];

  for (const file of files) {
    if (!file.includes(`${path.sep}agent-transcripts${path.sep}`)) continue;
    const sessionId = sessionIdFromTranscript(file);
    if (skipSessions.has(sessionId)) continue;
    events.push(...(await parseCursorTranscriptFile(file, sessionId)));
  }

  return { events, warnings };
}

export async function parseCursorTranscriptFile(
  filePath: string,
  sessionId = sessionIdFromTranscript(filePath),
): Promise<UsageEvent[]> {
  const lines = await readJsonl(filePath);
  if (lines.length === 0) return [];

  let recognized = 0;
  let jsonObjects = 0;
  const events: UsageEvent[] = [];

  for (const line of lines) {
    if (line.value === undefined) {
      if (line.lineNumber === lines[lines.length - 1]?.lineNumber) continue;
      throw new UnrecognizedLogFormatError(filePath, `invalid JSON on line ${line.lineNumber}`);
    }
    if (!isPlainObject(line.value)) continue;
    jsonObjects += 1;
    if (!looksLikeCursorTranscript(line.value)) continue;
    recognized += 1;

    const usage =
      extractUsageObject(line.value.usage, filePath, `line ${line.lineNumber}`) ??
      (isPlainObject(line.value.message)
        ? extractUsageObject(line.value.message.usage, filePath, `line ${line.lineNumber}`)
        : null);
    if (!usage) continue;

    events.push(
      makeUsageEvent({
        id: `cursor-jsonl:${sessionId}:${line.lineNumber}`,
        platform: "cursor",
        sessionId,
        timestamp: parseCursorTimestamp(line.value.timestamp ?? line.value.createdAt),
        inputTokens: usage.input,
        outputTokens: usage.output,
        source: "cursor-transcript",
        sourceFile: filePath,
      }),
    );
  }

  if (jsonObjects > 0 && recognized === 0) {
    throw new UnrecognizedLogFormatError(filePath);
  }

  return events;
}

function looksLikeCursorTranscript(obj: Record<string, unknown>): boolean {
  if (obj.role === "user" || obj.role === "assistant") return true;
  if (obj.type === "turn_ended") return true;
  if (obj.usage !== undefined || (isPlainObject(obj.message) && obj.message.usage !== undefined)) {
    return true;
  }
  return false;
}

function sessionIdFromTranscript(filePath: string): string {
  return path.basename(filePath, ".jsonl");
}

function parseJsonObject(value: unknown, filePath: string, key: string): Record<string, unknown> {
  let text: string;
  try {
    text = sqliteText(value);
  } catch {
    throw new UnrecognizedLogFormatError(filePath, `${key} value is not text or blob`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new UnrecognizedLogFormatError(filePath, `${key} value is not JSON`);
  }
  if (!isPlainObject(parsed)) {
    throw new UnrecognizedLogFormatError(filePath, `${key} value is not a JSON object`);
  }
  return parsed;
}

function sqliteText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Uint8Array) return new TextDecoder().decode(value);
  if (value instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(value));
  throw new Error("SQLite value is not text or blob");
}

function parseCursorTimestamp(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value === "string" && value.trim()) {
    const asNum = Number(value);
    if (Number.isFinite(asNum) && asNum > 0) {
      return asNum < 1e12 ? asNum * 1000 : asNum;
    }
    const ms = Date.parse(value);
    if (Number.isFinite(ms)) return ms;
  }
  return Date.now();
}

async function collectJsonl(root: string): Promise<string[]> {
  const out: string[] = [];
  await walk(root, out);
  return out;
}

async function walk(dir: string, out: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, out);
    else if (entry.isFile() && entry.name.endsWith(".jsonl")) out.push(full);
  }
}

async function dirExists(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}
