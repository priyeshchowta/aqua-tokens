import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { parseOtelPayload, toSanitizedApiRequestExport, type OtelApiRequest } from "./parse.js";

export interface OtelReceiverOptions {
  host?: string;
  port?: number;
  outPath: string;
  onEvent?: (event: OtelApiRequest) => void;
}

export interface OtelReceiver {
  host: string;
  port: number;
  url: string;
  close(): Promise<void>;
}

/**
 * Loopback OTLP HTTP JSON logs receiver.
 * Claude Code can export here with OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318
 * and OTEL_EXPORTER_OTLP_PROTOCOL=http/json. Nothing is forwarded off-machine.
 */
export function startOtelReceiver(options: OtelReceiverOptions): Promise<OtelReceiver> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 4318;
  mkdirSync(path.dirname(options.outPath), { recursive: true });

  const server: Server = createServer((req, res) => {
    void handle(req, res, options);
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const address = server.address();
      const boundPort = typeof address === "object" && address ? address.port : port;
      resolve({
        host,
        port: boundPort,
        url: `http://${host}:${boundPort}/v1/logs`,
        close: () =>
          new Promise((closeResolve, closeReject) => {
            server.close((err) => (err ? closeReject(err) : closeResolve()));
          }),
      });
    });
  });
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  options: OtelReceiverOptions,
): Promise<void> {
  if (req.method === "GET" && (req.url === "/health" || req.url === "/")) {
    json(res, 200, { ok: true, service: "aqua-tokens-otel-poc" });
    return;
  }

  if (req.method !== "POST" || (req.url !== "/v1/logs" && req.url !== "/v1/logs/")) {
    json(res, 404, { error: "POST /v1/logs with OTLP HTTP JSON" });
    return;
  }

  const contentType = String(req.headers["content-type"] ?? "");
  if (contentType.includes("protobuf") || contentType.includes("grpc")) {
    json(res, 415, {
      error: "protobuf/grpc not supported in this POC; set OTEL_EXPORTER_OTLP_PROTOCOL=http/json",
    });
    return;
  }

  let raw: string;
  try {
    raw = await readBody(req);
  } catch {
    json(res, 400, { error: "failed to read body" });
    return;
  }

  let payload: unknown;
  try {
    payload = raw.trim() ? JSON.parse(raw) : {};
  } catch {
    json(res, 400, { error: "body is not JSON" });
    return;
  }

  const parsed = parseOtelPayload(payload);
  for (const event of parsed.events) {
    // Persist only sanitized usage fields — never the raw OTLP payload.
    appendFileSync(options.outPath, JSON.stringify(toSanitizedApiRequestExport(event)) + "\n", "utf8");
    options.onEvent?.(event);
  }

  json(res, 200, { partialSuccess: {} });
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(text),
  });
  res.end(text);
}
