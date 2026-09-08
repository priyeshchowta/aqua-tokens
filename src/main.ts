import { Command } from "commander";
import { createRequire } from "node:module";
import { UnrecognizedLogFormatError } from "./errors.js";
import { formatReport, reportToJson } from "./report.js";
import { generateReport } from "./run.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

export async function runCli(argv = process.argv): Promise<void> {
  const program = new Command();
  program
    .name("aqua-tokens")
    .description(
      "Estimate water consumption from local Claude Code usage. Aqua itself is local-only.",
    )
    .version(version);

  program
    .command("report")
    .description("Show lifetime Claude Code totals and a today / this week / all-time breakdown")
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

  program.addHelpText(
    "after",
    `
Examples:
  $ aqua-tokens report
  $ aqua-tokens report --scope1
  $ aqua-tokens report --json
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
