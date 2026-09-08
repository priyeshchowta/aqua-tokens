import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readJsonl } from "../jsonl.js";
import {
  formatOtelApiRequest,
  parseOtelPayload,
  toSanitizedApiRequestExport,
  type OtelApiRequest,
} from "./parse.js";

export async function readOtelFile(filePath: string): Promise<OtelApiRequest[]> {
  if (filePath.endsWith(".jsonl")) {
    const lines = await readJsonl(filePath);
    const events: OtelApiRequest[] = [];
    for (const line of lines) {
      if (line.value === undefined) continue;
      events.push(...parseOtelPayload(line.value).events);
    }
    return events;
  }
  const payload = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  return parseOtelPayload(payload).events;
}

export function printOtelEvents(events: OtelApiRequest[]): string {
  if (events.length === 0) {
    return "No claude_code.api_request events found.\n";
  }
  return (
    events.map((event, index) => `--- event ${index + 1} ---\n${formatOtelApiRequest(event)}`).join("\n\n") +
    "\n"
  );
}

/** Write a single sanitized usage fixture (pretty JSON). Overwrites the path. */
export function writeSanitizedApiRequest(filePath: string, event: OtelApiRequest): void {
  mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  writeFileSync(filePath, JSON.stringify(toSanitizedApiRequestExport(event), null, 2) + "\n", "utf8");
}

/**
 * Printed by `npm run otel-poc -- --print-config`.
 * Explains which env vars a Claude Code user must set for the local POC.
 * Internal dev/testing tool only — not part of the public aqua-tokens CLI.
 */
export const MINIMUM_CLAUDE_OTEL_CONFIG = `Claude Code → Aqua local OTel (loopback only)
=============================================

1. Start Aqua first:
     npm run otel-poc -- --listen

2. Put the JSON below into ~/.claude/settings.json (under "env"),
   OR export the same variables in your shell before starting Claude Code.

3. Do NOT set OTEL_LOG_USER_PROMPTS, OTEL_LOG_TOOL_CONTENT, or
   OTEL_LOG_RAW_API_BODIES. Aqua only needs usage attributes.

4. Metrics and traces are disabled below so only logs are exported.

Environment variables:

  CLAUDE_CODE_ENABLE_TELEMETRY=1
      Turn on Claude Code telemetry (off by default).

  OTEL_METRICS_EXPORTER=none
      Do not export metrics to Aqua.

  OTEL_LOGS_EXPORTER=otlp
      Send log events (including claude_code.api_request) via OTLP.

  OTEL_EXPORTER_OTLP_PROTOCOL=http/json
      Aqua's POC speaks OTLP HTTP JSON only (not protobuf/gRPC).

  OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318
      Loopback collector. Aqua binds 127.0.0.1 only — not 0.0.0.0.

  OTEL_LOGS_EXPORT_INTERVAL=1000
      Flush logs about once per second so events arrive promptly.

settings.json fragment:

{
  "env": {
    "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
    "OTEL_METRICS_EXPORTER": "none",
    "OTEL_LOGS_EXPORTER": "otlp",
    "OTEL_EXPORTER_OTLP_PROTOCOL": "http/json",
    "OTEL_EXPORTER_OTLP_ENDPOINT": "http://127.0.0.1:4318",
    "OTEL_LOGS_EXPORT_INTERVAL": "1000"
  }
}

After one or two normal Claude Code requests, stop Claude, then inspect the
sanitized events Aqua printed (or --output ./api-request.json). Redact
request_id / session_id before sharing a fixture publicly.
`;
