import { existsSync } from "node:fs";
import { parseClaudeCode } from "./parsers/claude-code.js";
import { parseCursor } from "./parsers/cursor.js";
import { claudeProjectDirs, cursorStateDbCandidates, defaultStorePath } from "./paths.js";
import { UsageStore } from "./store.js";
import { buildReport } from "./aggregate.js";
import type { ParseResult, Platform, ReportData, ScopeId } from "./types.js";
import { loadMethodology } from "./water.js";

export interface GenerateReportOptions {
  scope1?: boolean;
  methodologyPath?: string;
  storePath?: string;
  claudeRoots?: string[];
  cursorDbPaths?: string[];
  cursorTranscriptRoots?: string[];
  now?: number;
}

export async function generateReport(options: GenerateReportOptions = {}): Promise<ReportData> {
  const methodology = loadMethodology(options.methodologyPath);
  const scope: ScopeId = options.scope1 ? "scope1" : "scope1plus2";

  const claude = await parseClaudeCode({ roots: options.claudeRoots });
  const cursor = await parseCursor({
    dbPaths: options.cursorDbPaths,
    transcriptRoots: options.cursorTranscriptRoots,
  });

  const store = new UsageStore(options.storePath ?? defaultStorePath());
  try {
    store.ingest([...claude.events, ...cursor.events]);
    const events = store.allEvents();

    const platformsScanned: Platform[] = [];
    const claudeRoots = options.claudeRoots ?? claudeProjectDirs();
    if (claudeRoots.some((root) => existsSync(root))) platformsScanned.push("claude-code");
    const cursorDbs = options.cursorDbPaths ?? cursorStateDbCandidates();
    if (cursorDbs.some((p) => existsSync(p))) platformsScanned.push("cursor");

    return buildReport(events, {
      scope,
      methodology,
      now: options.now,
      warnings: [...claude.warnings, ...cursor.warnings],
      platformsScanned,
    });
  } finally {
    store.close();
  }
}

export type { ParseResult };
