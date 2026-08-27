import { isPlainObject } from "../jsonl.js";
import { makeUsageEvent } from "../usage-event.js";
import type { UsageEvent } from "../types.js";
import {
  asOptionalNonNegInt,
  asOptionalNumber,
  asOptionalString,
  otlpAttributeMap,
  unwrapOtlpValue,
} from "./attributes.js";

export interface OtelApiRequest {
  requestId: string | null;
  clientRequestId: string | null;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheCreationTokens: number | null;
  costUsd: number | null;
  timestamp: string | null;
  sessionId: string | null;
  eventSequence: number | null;
}

/**
 * Public-safe usage fixture. Only the fields Aqua needs to validate water accounting.
 * No prompts, tool calls, raw bodies, env vars, or account identifiers.
 */
export interface SanitizedApiRequestExport {
  event: "claude_code.api_request";
  request_id: string | null;
  client_request_id: string | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_creation_tokens: number | null;
  cost_usd: number | null;
  timestamp: string | null;
  session_id: string | null;
}

export interface OtelParseResult {
  events: OtelApiRequest[];
  skipped: number;
  malformed: number;
}

/**
 * Extract `claude_code.api_request` records from:
 * - an OTLP HTTP JSON logs payload (`resourceLogs`)
 * - a single flattened attribute object
 * - an array of either
 */
export function parseOtelPayload(payload: unknown): OtelParseResult {
  const events: OtelApiRequest[] = [];
  let skipped = 0;
  let malformed = 0;

  for (const record of collectLogRecords(payload)) {
    if (record === undefined) {
      malformed += 1;
      continue;
    }
    const parsed = parseApiRequestRecord(record);
    if (parsed === "skip") {
      skipped += 1;
      continue;
    }
    if (parsed === "malformed") {
      malformed += 1;
      continue;
    }
    events.push(parsed);
  }

  return { events, skipped, malformed };
}

export function otelRequestToUsageEvent(
  req: OtelApiRequest,
  sourceFile: string,
): UsageEvent | null {
  const input = req.inputTokens ?? 0;
  const output = req.outputTokens ?? 0;
  if (input === 0 && output === 0) return null;
  const requestId = req.requestId ?? req.clientRequestId;
  const id = requestId
    ? `claude-otel:${requestId}`
    : `claude-otel:${req.sessionId ?? "unknown"}:${req.eventSequence ?? req.timestamp ?? "unknown"}`;
  return makeUsageEvent({
    id,
    platform: "claude-code",
    sessionId: req.sessionId ?? "unknown",
    requestId: requestId ?? undefined,
    timestamp: parseOtelTimestamp(req.timestamp),
    model: req.model ?? undefined,
    inputTokens: input,
    outputTokens: output,
    cacheReadTokens: req.cacheReadTokens ?? 0,
    cacheCreationTokens: req.cacheCreationTokens ?? 0,
    source: "claude-otel",
    sourceFile,
  });
}

export function formatOtelApiRequest(req: OtelApiRequest): string {
  return [
    `event.name claude_code.api_request`,
    `request_id ${req.requestId ?? "(missing)"}`,
    `model ${req.model ?? "(missing)"}`,
    `input_tokens ${req.inputTokens ?? "(missing)"}`,
    `output_tokens ${req.outputTokens ?? "(missing)"}`,
    `cache_read_tokens ${req.cacheReadTokens ?? "(missing)"}`,
    `cache_creation_tokens ${req.cacheCreationTokens ?? "(missing)"}`,
    `cost_usd ${req.costUsd ?? "(missing)"}`,
    `timestamp/session_id ${req.timestamp ?? "(missing)"} / ${req.sessionId ?? "(missing)"}`,
  ].join("\n");
}

/** Strip an api_request down to the usage fields Aqua needs (safe to share after redacting ids). */
export function toSanitizedApiRequestExport(req: OtelApiRequest): SanitizedApiRequestExport {
  return {
    event: "claude_code.api_request",
    request_id: req.requestId,
    client_request_id: req.clientRequestId,
    model: req.model,
    input_tokens: req.inputTokens,
    output_tokens: req.outputTokens,
    cache_read_tokens: req.cacheReadTokens,
    cache_creation_tokens: req.cacheCreationTokens,
    cost_usd: req.costUsd,
    timestamp: req.timestamp,
    session_id: req.sessionId,
  };
}

function collectLogRecords(payload: unknown): unknown[] {
  if (payload === undefined || payload === null) return [undefined];
  if (Array.isArray(payload)) {
    return payload.flatMap((item) => collectLogRecords(item));
  }
  if (!isPlainObject(payload)) return [undefined];

  if (Array.isArray(payload.resourceLogs)) {
    const records: unknown[] = [];
    for (const resourceLogs of payload.resourceLogs) {
      if (!isPlainObject(resourceLogs) || !Array.isArray(resourceLogs.scopeLogs)) continue;
      for (const scopeLogs of resourceLogs.scopeLogs) {
        if (!isPlainObject(scopeLogs) || !Array.isArray(scopeLogs.logRecords)) continue;
        records.push(...scopeLogs.logRecords);
      }
    }
    return records;
  }

  if (Array.isArray(payload.logRecords)) return payload.logRecords;
  return [payload];
}

function parseApiRequestRecord(record: unknown): OtelApiRequest | "skip" | "malformed" {
  if (!isPlainObject(record)) return "malformed";

  const persisted = fromPersistedPoc(record);
  if (persisted) return persisted;

  const attrs = {
    ...otlpAttributeMap(record.attributes),
    ...flattenOwnFields(record),
  };

  const eventName =
    asOptionalString(attrs["event.name"]) ??
    asOptionalString(unwrapOtlpValue(isPlainObject(record.body) ? record.body : undefined)) ??
    asOptionalString(record.body) ??
    asOptionalString(attrs.body);

  if (!isApiRequestEvent(eventName)) return "skip";

  const inputTokens = firstNumber(attrs, ["input_tokens"]);
  const outputTokens = firstNumber(attrs, ["output_tokens"]);
  const cacheReadTokens = firstNumber(attrs, ["cache_read_tokens"]);
  const cacheCreationTokens = firstNumber(attrs, ["cache_creation_tokens"]);

  return {
    requestId: firstString(attrs, ["request_id", "gen_ai.response.id"]),
    clientRequestId: firstString(attrs, ["client_request_id"]),
    model: firstString(attrs, ["model", "gen_ai.request.model"]),
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    costUsd: asOptionalNumber(attrs.cost_usd),
    timestamp:
      firstString(attrs, ["event.timestamp"]) ??
      nanoToIso(attrs.timeUnixNano ?? record.timeUnixNano),
    sessionId: firstString(attrs, ["session.id", "sessionId"]),
    eventSequence: asOptionalNonNegInt(attrs["event.sequence"]),
  };
}

function fromPersistedPoc(record: Record<string, unknown>): OtelApiRequest | null {
  if ("resourceLogs" in record || "attributes" in record || "logRecords" in record) return null;

  const snake =
    record.event === "claude_code.api_request" ||
    "input_tokens" in record ||
    "request_id" in record ||
    "cache_read_tokens" in record ||
    "session_id" in record;
  if (snake) {
    return {
      requestId: asOptionalString(record.request_id),
      clientRequestId: asOptionalString(record.client_request_id),
      model: asOptionalString(record.model),
      inputTokens: asOptionalNonNegInt(record.input_tokens),
      outputTokens: asOptionalNonNegInt(record.output_tokens),
      cacheReadTokens: asOptionalNonNegInt(record.cache_read_tokens),
      cacheCreationTokens: asOptionalNonNegInt(record.cache_creation_tokens),
      costUsd: asOptionalNumber(record.cost_usd),
      timestamp: asOptionalString(record.timestamp),
      sessionId: asOptionalString(record.session_id),
      eventSequence: asOptionalNonNegInt(record.event_sequence),
    };
  }

  const camel =
    "inputTokens" in record ||
    "requestId" in record ||
    "cacheReadTokens" in record ||
    "sessionId" in record;
  if (!camel) return null;
  return {
    requestId: asOptionalString(record.requestId),
    clientRequestId: asOptionalString(record.clientRequestId),
    model: asOptionalString(record.model),
    inputTokens: asOptionalNonNegInt(record.inputTokens),
    outputTokens: asOptionalNonNegInt(record.outputTokens),
    cacheReadTokens: asOptionalNonNegInt(record.cacheReadTokens),
    cacheCreationTokens: asOptionalNonNegInt(record.cacheCreationTokens),
    costUsd: asOptionalNumber(record.costUsd),
    timestamp: asOptionalString(record.timestamp),
    sessionId: asOptionalString(record.sessionId),
    eventSequence: asOptionalNonNegInt(record.eventSequence),
  };
}

function isApiRequestEvent(name: string | null): boolean {
  if (!name) return false;
  return name === "api_request" || name === "claude_code.api_request";
}

function flattenOwnFields(record: Record<string, unknown>): Record<string, unknown> {
  const skip = new Set(["attributes", "resourceLogs", "scopeLogs", "logRecords", "body"]);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (skip.has(key)) continue;
    out[key] = unwrapOtlpValue(value) ?? value;
  }
  return out;
}

function firstString(attrs: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = asOptionalString(attrs[key]);
    if (value) return value;
  }
  return null;
}

function firstNumber(attrs: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    if (!(key in attrs) || attrs[key] === undefined || attrs[key] === null) continue;
    return asOptionalNonNegInt(attrs[key]);
  }
  return null;
}

function nanoToIso(value: unknown): string | null {
  const n = asOptionalNumber(value);
  if (n === null) return asOptionalString(value);
  const ms = n > 1e15 ? n / 1e6 : n > 1e12 ? n / 1e3 : n;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function parseOtelTimestamp(value: string | null): number {
  if (!value) return Date.now();
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : Date.now();
}
