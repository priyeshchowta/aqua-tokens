import { readFileSync } from "node:fs";
import { readJsonl } from "../jsonl.js";
import { formatOtelApiRequest, parseOtelPayload, type OtelApiRequest } from "./parse.js";

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
  return events
    .map((event, index) => `--- event ${index + 1} ---\n${formatOtelApiRequest(event)}`)
    .join("\n\n") + "\n";
}

export const MINIMUM_CLAUDE_OTEL_CONFIG = `{
  "env": {
    "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
    "OTEL_METRICS_EXPORTER": "none",
    "OTEL_LOGS_EXPORTER": "otlp",
    "OTEL_EXPORTER_OTLP_PROTOCOL": "http/json",
    "OTEL_EXPORTER_OTLP_ENDPOINT": "http://127.0.0.1:4318",
    "OTEL_LOGS_EXPORT_INTERVAL": "1000"
  }
}
`;
