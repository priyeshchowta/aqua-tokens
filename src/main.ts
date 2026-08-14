import { Command } from "commander";
import { createRequire } from "node:module";
import { UnrecognizedLogFormatError } from "./errors.js";
import { MINIMUM_CLAUDE_OTEL_CONFIG, printOtelEvents, readOtelFile } from "./otel/print.js";
import { formatOtelApiRequest } from "./otel/parse.js";
import { startOtelReceiver } from "./otel/receiver.js";
import { defaultOtelPocPath } from "./paths.js";
import { formatReport, reportToJson } from "./report.js";
import { generateReport } from "./run.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

export async function runCli(argv = process.argv): Promise<void> {
  const program = new Command();
  program
    .name("aqua-tokens")
    .description(
      "Estimate water consumption from local Claude Code and Cursor token logs. Entirely local — no network calls.",
    )
    .version(version);

  program
    .command("report")
    .description("Show lifetime totals and a today / this week / all-time breakdown by platform")
    .option("--scope1", "Use the conservative on-site-cooling-only (scope-1) range instead of scope-1+2")
    .option("--json", "Print machine-readable JSON")
    .option("--methodology <path>", "Override water-methodology.json")
    .option("--store <path>", "Override the local SQLite history path")
    .action(async (opts: { scope1?: boolean; json?: boolean; methodology?: string; store?: string }) => {
      const report = await generateReport({
        scope1: Boolean(opts.scope1),
        methodologyPath: opts.methodology,
        storePath: opts.store,
      });
      if (opts.json) {
        process.stdout.write(JSON.stringify(reportToJson(report), null, 2) + "\n");
        return;
      }
      process.stdout.write(formatReport(report));
    });

  program
    .command("otel-poc")
    .description(
      "Proof of concept: receive or read Claude Code OpenTelemetry api_request events locally (no Aqua server)",
    )
    .option("--listen", "Start a loopback OTLP HTTP JSON receiver on 127.0.0.1:4318")
    .option("--port <port>", "Listen port (default 4318)", (v) => Number(v), 4318)
    .option("--file <path>", "Parse a captured OTLP JSON/JSONL file and print api_request fields")
    .option("--out <path>", "Where to append received events")
    .option("--print-config", "Print the minimum Claude Code settings.json env block")
    .action(async (opts: {
      listen?: boolean;
      port?: number;
      file?: string;
      out?: string;
      printConfig?: boolean;
    }) => {
      if (opts.printConfig) {
        process.stdout.write(MINIMUM_CLAUDE_OTEL_CONFIG);
        return;
      }
      if (opts.file) {
        const events = await readOtelFile(opts.file);
        process.stdout.write(printOtelEvents(events));
        return;
      }
      if (opts.listen) {
        const outPath = opts.out ?? defaultOtelPocPath();
        const receiver = await startOtelReceiver({
          host: "127.0.0.1",
          port: opts.port ?? 4318,
          outPath,
          onEvent: (event) => {
            process.stdout.write(`--- event ---\n${formatOtelApiRequest(event)}\n\n`);
          },
        });
        process.stdout.write(
          [
            `Listening on ${receiver.url} (loopback only)`,
            `Persisting api_request events to ${outPath}`,
            "Telemetry stays on this machine. Do not point Claude Code at a remote collector.",
            "",
            "Minimum Claude Code settings (claude --debug to verify export):",
            MINIMUM_CLAUDE_OTEL_CONFIG,
            "Waiting for claude_code.api_request events. Ctrl+C to stop.",
            "",
          ].join("\n"),
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
        "Specify --listen, --file <path>, or --print-config. See aqua-tokens otel-poc --help.\n",
      );
      process.exitCode = 1;
    });

  program.addHelpText(
    "after",
    `
Examples:
  $ aqua-tokens report
  $ aqua-tokens report --scope1
  $ aqua-tokens report --json
  $ aqua-tokens otel-poc --print-config
  $ aqua-tokens otel-poc --file tests/fixtures/otel/api-request.json
  $ aqua-tokens otel-poc --listen
`,
  );

  try {
    await program.parseAsync(argv);
  } catch (err: unknown) {
    if (err instanceof UnrecognizedLogFormatError) {
      console.error(err.message);
      process.exitCode = 1;
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    process.exitCode = 1;
  }
}
