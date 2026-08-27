import { createReadStream } from "node:fs";

export interface JsonlLine {
  lineNumber: number;
  raw: string;
  value: unknown;
}

/**
 * Stream a JSONL file, splitting only on \\n / \\r\\n.
 * Do not use readline — U+2028/U+2029 can appear inside JSON strings and would
 * tear valid JSON in half.
 *
 * A trailing incomplete line (common in an active session) is skipped when it
 * does not parse. Fully invalid JSON in the middle is returned as
 * `value: undefined` so callers can fail loudly.
 */
export async function readJsonl(filePath: string): Promise<JsonlLine[]> {
  const lines: JsonlLine[] = [];
  const stream = createReadStream(filePath, { encoding: "utf8" });
  let buffer = "";
  let lineNumber = 0;

  const consume = (raw: string, allowIncomplete: boolean) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    lineNumber += 1;
    try {
      lines.push({ lineNumber, raw: trimmed, value: JSON.parse(trimmed) });
    } catch {
      if (allowIncomplete) {
        lineNumber -= 1;
        return;
      }
      lines.push({ lineNumber, raw: trimmed, value: undefined });
    }
  };

  for await (const chunk of stream) {
    buffer += chunk;
    let idx = buffer.indexOf("\n");
    while (idx >= 0) {
      let raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      if (raw.endsWith("\r")) raw = raw.slice(0, -1);
      consume(raw, false);
      idx = buffer.indexOf("\n");
    }
  }
  if (buffer.length > 0) consume(buffer, true);

  return lines;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asNonNegInt(value: unknown): number | null {
  if (value === undefined || value === null) return 0;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return Math.floor(value);
}
