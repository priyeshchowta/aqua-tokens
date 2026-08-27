import { existsSync } from "node:fs";
import { parseClaudeCode } from "./parsers/claude-code.js";
import { claudeProjectDirs, defaultStorePath } from "./paths.js";
import { UsageStore } from "./store.js";
import { buildReport } from "./aggregate.js";
import type { ParseResult, ReportData, ScopeId } from "./types.js";
import { loadMethodology } from "./water.js";

export interface GenerateReportOptions {
  scope1?: boolean;
  methodologyPath?: string;
  storePath?: string;
  claudeRoots?: string[];
  now?: number;
}

export async function generateReport(options: GenerateReportOptions = {}): Promise<ReportData> {
  const methodology = loadMethodology(options.methodologyPath);
  const scope: ScopeId = options.scope1 ? "scope1" : "scope1plus2";

  const claude = await parseClaudeCode({ roots: options.claudeRoots });

  const store = new UsageStore(options.storePath ?? defaultStorePath());
  try {
    store.ingest(claude.events);
    const events = store.allEvents().filter((e) => e.platform === "claude-code");

    const claudeRoots = options.claudeRoots ?? claudeProjectDirs();
    const warnings = [...claude.warnings];
    if (!claudeRoots.some((root) => existsSync(root)) && events.length === 0) {
      warnings.push({
        platform: "claude-code",
        message:
          "No Claude Code project logs found under ~/.claude. Run Claude Code locally, or configure OTel (aqua-tokens otel-poc --print-config).",
      });
    }

    return buildReport(events, {
      scope,
      methodology,
      now: options.now,
      warnings,
    });
  } finally {
    store.close();
  }
}

export type { ParseResult };
