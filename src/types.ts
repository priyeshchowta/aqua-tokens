export type Platform = "claude-code";

export type ScopeId = "scope1" | "scope1plus2";

/** Where a usage event was observed. JSONL and OTel are not interchangeable. */
export type UsageSource = "claude-jsonl" | "claude-otel";

export interface UsageEvent {
  /** Stable deduplication key. Reprocessing the same source must reuse this id. */
  id: string;
  platform: Platform;
  sessionId: string;
  /** Anthropic API request id (`req_…`) when the source exposes one. */
  requestId?: string;
  timestamp: number;
  model?: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  source: UsageSource;
  sourceFile: string;
}

export interface ParseWarning {
  platform: Platform;
  message: string;
}

export interface ParseResult {
  events: UsageEvent[];
  warnings: ParseWarning[];
}

export interface TokenTotals {
  tokens: number;
  inputTokens: number;
  outputTokens: number;
}

export interface WaterRange {
  lowMl: number;
  highMl: number;
  scopeLabel: string;
  scopeId: ScopeId;
}

export interface PeriodTotals extends TokenTotals {
  water: WaterRange;
}

export interface ReportRow {
  period: "today" | "week" | "all";
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  water: WaterRange;
}

export interface ReportData {
  scope: ScopeId;
  scopeLabel: string;
  /** v1 supports Claude Code only. */
  source: "Claude Code";
  lifetime: PeriodTotals;
  rows: ReportRow[];
  comparison: string;
  caveat: string;
  citation: string;
  tokenAccounting: string;
  warnings: ParseWarning[];
}

export interface MethodologyScope {
  id: string;
  label: string;
  description: string;
  ml_per_1000_tokens_low: number;
  ml_per_1000_tokens_high: number;
}

export interface TokenAccountingRule {
  version: number;
  counted: string[];
  excluded: string[];
  label: string;
  rationale: string;
  caveat: string;
}

export interface Methodology {
  version: number;
  default_scope: ScopeId;
  interpolation: {
    note: string;
    paper_query_ml_low: number;
    paper_query_ml_high: number;
    paper_query_tokens_low: number;
    paper_query_tokens_high: number;
    reference_tokens: number;
  };
  scopes: {
    scope1plus2: MethodologyScope;
    scope1: MethodologyScope;
  };
  token_accounting: TokenAccountingRule;
  caveat: string;
  citation: string;
  comparisons: {
    toilet_flush_ml: number;
  };
}

export interface IngestStats {
  inserted: number;
  ignored: number;
  skipped: number;
}
