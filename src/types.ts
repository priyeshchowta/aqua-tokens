export type Platform = "claude-code" | "cursor";

export type ScopeId = "scope1" | "scope1plus2";

export interface UsageEvent {
  id: string;
  platform: Platform;
  sessionId: string;
  timestamp: number;
  inputTokens: number;
  outputTokens: number;
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
  platform: Platform;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  water: WaterRange;
}

export interface ReportData {
  scope: ScopeId;
  scopeLabel: string;
  lifetime: PeriodTotals;
  rows: ReportRow[];
  comparison: string;
  caveat: string;
  citation: string;
  warnings: ParseWarning[];
  platformsScanned: Platform[];
}

export interface MethodologyScope {
  id: string;
  label: string;
  description: string;
  ml_per_1000_tokens_low: number;
  ml_per_1000_tokens_high: number;
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
  caveat: string;
  citation: string;
  comparisons: {
    toilet_flush_ml: number;
  };
}
