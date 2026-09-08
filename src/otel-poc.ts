#!/usr/bin/env node
/**
 * Internal dev/testing tool — NOT part of the public `aqua-tokens` CLI.
 *
 * Proof of concept: receive or read Claude Code OpenTelemetry api_request
 * events locally (no Aqua server). Live capture is accepted with caveats
 * (see docs/live-verification.md) — known issues include quantized
 * `input_tokens` under cache-heavy sessions, null `request_id` under some
 * proxies, and it is not wired into `aqua-tokens report`.
 *
 * Run via `npm run otel-poc -- <flags>`, not via the installed binary.
 */
import { Command } from "commander";
import { MINIMUM_CLAUDE_OTEL_CONFIG, printOtelEvents, readOtelFile, writeSanitizedApiRequest } from "./otel/print.js";
import { formatOtelApiRequest } from "./otel/parse.js";
import { startOtelReceiver } from "./otel/receiver.js";
import { defaultOtelPocPath } from "./paths.js";

export async function runOtelPoc(argv = process.argv): Promise<void> {
  const program = new Command();
  program
    .name("otel-poc")
    .description(
      "[internal] Proof of concept: receive or read Claude Code OpenTelemetry api_request events locally (no Aqua server)",
    )
    .option("--listen", "Start a loopback OTLP HTTP JSON receiver on 127.0.0.1:4318")
    .option("--port <port>", "Listen port (default 4318)", (v) => Number(v), 4318)
    .option("--file <path>", "Parse a captured OTLP JSON/JSONL file and print api_request fields")
    .option("--out <path>", "JSONL path for sanitized events (default ~/.aqua-tokens/otel-poc.jsonl)")
    .option(
      "--output <path>",
      "Write the latest sanitized usage event as pretty JSON (also used as --out when listening if --out omitted)",
    )
    .option("--print-config", "Print Claude Code env/settings needed for the local OTel POC")
    .action(async (opts: {
      listen?: boolean;
      port?: number;
      file?: string;
      out?: string;
      output?: string;
      printConfig?: boolean;
    }) => {
      if (opts.printConfig) {
        process.stdout.write(MINIMUM_CLAUDE_OTEL_CONFIG);
        return;
      }
      if (opts.file) {
        const events = await readOtelFile(opts.file);
        process.stdout.write(printOtelEvents(events));
        if (opts.output && events[0]) {
          writeSanitizedApiRequest(opts.output, events[0]);
          process.stdout.write(`Wrote sanitized fixture to ${opts.output}\n`);
        }
        return;
      }
      if (opts.listen) {
        const outPath = opts.out ?? (opts.output?.endsWith(".jsonl") ? opts.output : undefined) ?? defaultOtelPocPath();
        const snapshotPath =
          opts.output && !opts.output.endsWith(".jsonl") ? opts.output : undefined;
        const receiver = await startOtelReceiver({
          host: "127.0.0.1",
          port: opts.port ?? 4318,
          outPath,
          onEvent: (event) => {
            process.stdout.write(`--- event ---\n${formatOtelApiRequest(event)}\n\n`);
            if (snapshotPath) {
              writeSanitizedApiRequest(snapshotPath, event);
              process.stdout.write(`Wrote sanitized fixture to ${snapshotPath}\n\n`);
            }
          },
        });
        process.stdout.write(
          [
            `Listening on ${receiver.url} (loopback only)`,
            `Persisting sanitized api_request events to ${outPath}`,
            snapshotPath ? `Latest event also written to ${snapshotPath}` : null,
            "Telemetry stays on this machine. Do not point Claude Code at a remote collector.",
            "Aqua prints usage fields only — not prompts, tools, or raw API bodies.",
            "",
            "Minimum Claude Code settings (claude --debug to verify export):",
            "",
            MINIMUM_CLAUDE_OTEL_CONFIG,
            "Waiting for claude_code.api_request events. Ctrl+C to stop.",
            "",
          ]
            .filter((line): line is string => line !== null)
            .join("\n"),
        );
        await new Promise<void>((resolve) => {
          const stop = () => {
            void receiver.close().finally(resolve);
          };
          process.on("SIGINT", stop);
          process.on("SIGTERM", stop);
        });
        return;
      }
      process.stderr.write(
        "Specify --listen, --file <path>, or --print-config. See: npm run otel-poc -- --help\n",
      );
      process.exitCode = 1;
    });

  program.addHelpText(
    "after",
    `
Examples:
  $ npm run otel-poc -- --print-config
  $ npm run otel-poc -- --file tests/fixtures/otel/api-request.json
  $ npm run otel-poc -- --file tests/fixtures/otel/api-request.json --output ./api-request.json
  $ npm run otel-poc -- --listen
  $ npm run otel-poc -- --listen --output ./api-request.json
`,
  );

  await program.parseAsync(argv);
}

await runOtelPoc();
