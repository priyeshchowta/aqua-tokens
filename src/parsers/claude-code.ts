import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { UnrecognizedLogFormatError } from "../errors.js";
import { asNonNegInt, isPlainObject, readJsonl } from "../jsonl.js";
import { claudeProjectDirs } from "../paths.js";
import { makeUsageEvent } from "../usage-event.js";
import type { ParseResult, UsageEvent } from "../types.js";

/** Line types observed in Claude Code JSONL transcripts. Unknown types are tolerated only when the surrounding record still looks like Claude Code. */
const KNOWN_TYPES = new Set([
  "user",
  "assistant",
  "system",
  "attachment",
  "progress",
  "queue-operation",
  "last-prompt",
  "file-history-snapshot",
  "compact",
  "summary",
  "stream_event",
]);

export interface ClaudeParseOptions {
  roots?: string[];
}

export async function parseClaudeCode(options: ClaudeParseOptions = {}): Promise<ParseResult> {
  const roots = options.roots ?? claudeProjectDirs();
  const files = await collectJsonl(roots);
  const events: UsageEvent[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    events.push(...(await parseClaudeFile(file, seen)));
  }

  return { events, warnings: [] };
}

async function collectJsonl(roots: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const root of roots) {
    if (!(await exists(root))) continue;
    await walkJsonl(root, out);
  }
  return out;
}

async function walkJsonl(dir: string, out: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkJsonl(full, out);
    } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      out.push(full);
    }
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

export async function parseClaudeFile(filePath: string, seen = new Set<string>()): Promise<UsageEvent[]> {
  const lines = await readJsonl(filePath);
  if (lines.length === 0) return [];

  let recognized = 0;
  let jsonObjects = 0;
  const events: UsageEvent[] = [];

  for (const line of lines) {
    if (line.value === undefined) {
      // Active sessions often end with a truncated line; skip only the last one.
      if (line.lineNumber === lines[lines.length - 1]?.lineNumber) continue;
      throw new UnrecognizedLogFormatError(filePath, `invalid JSON on line ${line.lineNumber}`);
    }
    if (!isPlainObject(line.value)) continue;
    jsonObjects += 1;

    if (!looksLikeClaudeRecord(line.value)) continue;
    recognized += 1;

    const extracted = extractUsage(line.value, filePath, line.lineNumber);
    if (!extracted) continue;

    if (seen.has(extracted.id)) continue;
    seen.add(extracted.id);
    events.push(extracted);
  }

  if (jsonObjects > 0 && recognized === 0) {
    throw new UnrecognizedLogFormatError(filePath);
  }

  return events;
}

function looksLikeClaudeRecord(obj: Record<string, unknown>): boolean {
  const type = obj.type;
  if (typeof type === "string" && KNOWN_TYPES.has(type)) return true;
  if (typeof type === "string" && hasClaudeEnvelope(obj)) return true;
  return false;
}

function hasClaudeEnvelope(obj: Record<string, unknown>): boolean {
  return (
    typeof obj.sessionId === "string" &&
    (typeof obj.timestamp === "string" || typeof obj.cwd === "string" || typeof obj.version === "string")
  );
}

function extractUsage(
  obj: Record<string, unknown>,
  filePath: string,
  lineNumber: number,
): UsageEvent | null {
  if (obj.type !== "assistant") return null;

  const message = obj.message;
  if (message === undefined || message === null) return null;
  if (!isPlainObject(message)) {
    throw new UnrecognizedLogFormatError(filePath, `assistant message is not an object on line ${lineNumber}`);
  }

  if (message.model === "<synthetic>") return null;

  const usage = message.usage;
  if (usage === undefined || usage === null) return null;
  if (!isPlainObject(usage)) {
    throw new UnrecognizedLogFormatError(filePath, `usage is not an object on line ${lineNumber}`);
  }
  if (!("input_tokens" in usage) || !("output_tokens" in usage)) {
    throw new UnrecognizedLogFormatError(
      filePath,
      `usage is missing input_tokens/output_tokens on line ${lineNumber}`,
    );
  }

  const input = asNonNegInt(usage.input_tokens);
  const output = asNonNegInt(usage.output_tokens);
  if (input === null || output === null) {
    throw new UnrecognizedLogFormatError(
      filePath,
      `usage.input_tokens / usage.output_tokens are not numbers on line ${lineNumber}`,
    );
  }

  const cacheRead = optionalCacheTokens(
    usage.cache_read_input_tokens ?? usage.cache_read_tokens,
    filePath,
    lineNumber,
    "cache_read",
  );
  const cacheCreation = optionalCacheTokens(
    usage.cache_creation_input_tokens ?? usage.cache_creation_tokens,
    filePath,
    lineNumber,
    "cache_creation",
  );

  if (input === 0 && output === 0) return null;

  const timestamp = parseTimestamp(obj.timestamp ?? message.timestamp);
  const sessionId =
    (typeof obj.sessionId === "string" && obj.sessionId) ||
    sessionIdFromPath(filePath) ||
    "unknown";
  const messageId =
    (typeof message.id === "string" && message.id) ||
    (typeof obj.uuid === "string" && obj.uuid) ||
    `${filePath}:${lineNumber}`;
  const requestId =
    stringField(obj.requestId) ??
    stringField(obj.request_id) ??
    stringField(message.requestId) ??
    stringField(message.request_id);
  const model = stringField(message.model);

  return makeUsageEvent({
    id: `claude:${messageId}`,
    platform: "claude-code",
    sessionId,
    requestId,
    timestamp,
    model,
    inputTokens: input,
    outputTokens: output,
    cacheReadTokens: cacheRead,
    cacheCreationTokens: cacheCreation,
    source: "claude-jsonl",
    sourceFile: filePath,
  });
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function optionalCacheTokens(
  value: unknown,
  filePath: string,
  lineNumber: number,
  label: string,
): number {
  if (value === undefined || value === null) return 0;
  const parsed = asNonNegInt(value);
  if (parsed === null) {
    throw new UnrecognizedLogFormatError(
      filePath,
      `usage.${label} tokens are not numbers on line ${lineNumber}`,
    );
  }
  return parsed;
}

function parseTimestamp(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value === "string" && value.trim()) {
    const ms = Date.parse(value);
    if (Number.isFinite(ms)) return ms;
  }
  return Date.now();
}

function sessionIdFromPath(filePath: string): string {
  return path.basename(filePath, ".jsonl");
}
