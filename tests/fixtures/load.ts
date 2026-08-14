import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));

export function claudeFixture(name: string): string {
  return path.join(dir, "claude-code", name);
}

export function otelFixture(name: string): string {
  return path.join(dir, "otel", name);
}

export function otlpApiRequest(attributes: Record<string, unknown>): unknown {
  return {
    resourceLogs: [
      {
        scopeLogs: [
          {
            logRecords: [
              {
                timeUnixNano: "1786692001000000000",
                body: { stringValue: "claude_code.api_request" },
                attributes: Object.entries({
                  "event.name": "api_request",
                  "event.timestamp": "2026-08-14T10:00:01.000Z",
                  "session.id": "sess-otel-1",
                  ...attributes,
                }).map(([key, value]) => otlpAttr(key, value)),
              },
            ],
          },
        ],
      },
    ],
  };
}

function otlpAttr(key: string, value: unknown): { key: string; value: Record<string, unknown> } {
  if (typeof value === "string") return { key, value: { stringValue: value } };
  if (typeof value === "number" && Number.isInteger(value)) {
    return { key, value: { intValue: String(value) } };
  }
  if (typeof value === "number") return { key, value: { doubleValue: value } };
  if (typeof value === "boolean") return { key, value: { boolValue: value } };
  return { key, value: { stringValue: String(value) } };
}
