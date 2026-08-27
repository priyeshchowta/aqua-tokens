import { countedTokens } from "./accounting.js";
import type { Methodology, ReportData, ReportRow, ScopeId, UsageEvent } from "./types.js";
import { tokensToWater, toiletFlushComparison } from "./water.js";

const PERIODS: Array<ReportRow["period"]> = ["today", "week", "all"];

export function startOfLocalDay(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Rolling 7 local calendar days, including today. */
export function startOfLocalWeek(now: number): number {
  return startOfLocalDay(now) - 6 * 24 * 60 * 60 * 1000;
}

export function sumTokens(events: UsageEvent[]): { tokens: number; inputTokens: number; outputTokens: number } {
  let inputTokens = 0;
  let outputTokens = 0;
  for (const event of events) {
    inputTokens += event.inputTokens;
    outputTokens += event.outputTokens;
  }
  return { tokens: countedTokens({ inputTokens, outputTokens }), inputTokens, outputTokens };
}

export function buildReport(
  events: UsageEvent[],
  options: {
    scope: ScopeId;
    methodology: Methodology;
    now?: number;
    warnings?: ReportData["warnings"];
  },
): ReportData {
  const now = options.now ?? Date.now();
  const todayStart = startOfLocalDay(now);
  const weekStart = startOfLocalWeek(now);
  const { methodology, scope } = options;

  const inPeriod = (event: UsageEvent, period: ReportRow["period"]) => {
    if (period === "all") return true;
    if (period === "today") return event.timestamp >= todayStart;
    return event.timestamp >= weekStart;
  };

  const rows: ReportRow[] = PERIODS.map((period) => {
    const subset = events.filter((e) => inPeriod(e, period));
    const totals = sumTokens(subset);
    return {
      period,
      ...totals,
      water: tokensToWater(totals.tokens, scope, methodology),
    };
  });

  const lifetimeTotals = sumTokens(events);
  const lifetimeWater = tokensToWater(lifetimeTotals.tokens, scope, methodology);
  const spec = methodology.scopes[scope];

  return {
    scope,
    scopeLabel: spec.label,
    source: "Claude Code",
    lifetime: { ...lifetimeTotals, water: lifetimeWater },
    rows,
    comparison: toiletFlushComparison(lifetimeWater.lowMl, methodology),
    caveat: methodology.caveat,
    citation: methodology.citation,
    tokenAccounting: methodology.token_accounting.caveat,
    warnings: options.warnings ?? [],
  };
}
