import { formatTokens, formatVolumeRange, pad, padLeft } from "./format.js";
import type { Platform, ReportData, ReportRow } from "./types.js";

const PLATFORM_LABEL: Record<Platform, string> = {
  "claude-code": "Claude Code",
  cursor: "Cursor",
};

const PERIOD_LABEL: Record<ReportRow["period"], string> = {
  today: "Today",
  week: "This week",
  all: "All-time",
};

export function formatReport(report: ReportData): string {
  const { lifetime } = report;
  const water = formatVolumeRange(lifetime.water.lowMl, lifetime.water.highMl);
  const headline = `🌊 Lifetime: ${formatTokens(lifetime.tokens)} tokens · ${water}, ${report.scopeLabel}`;

  const tableRows = report.rows.map((row) => ({
    period: PERIOD_LABEL[row.period],
    platform: PLATFORM_LABEL[row.platform],
    tokens: formatTokens(row.tokens),
    water: formatVolumeRange(row.water.lowMl, row.water.highMl),
  }));

  const widths = {
    period: Math.max("Period".length, ...tableRows.map((r) => r.period.length)),
    platform: Math.max("Platform".length, ...tableRows.map((r) => r.platform.length)),
    tokens: Math.max("Tokens".length, ...tableRows.map((r) => r.tokens.length)),
    water: Math.max(`Water (${report.scopeLabel})`.length, ...tableRows.map((r) => r.water.length)),
  };

  const waterHeader = `Water (${report.scopeLabel})`;
  const header =
    "  " +
    pad("Period", widths.period) +
    "  " +
    pad("Platform", widths.platform) +
    "  " +
    padLeft("Tokens", widths.tokens) +
    "  " +
    pad(waterHeader, widths.water);
  const rule =
    "  " +
    "-".repeat(widths.period) +
    "  " +
    "-".repeat(widths.platform) +
    "  " +
    "-".repeat(widths.tokens) +
    "  " +
    "-".repeat(widths.water);

  const body = tableRows
    .map(
      (row) =>
        "  " +
        pad(row.period, widths.period) +
        "  " +
        pad(row.platform, widths.platform) +
        "  " +
        padLeft(row.tokens, widths.tokens) +
        "  " +
        pad(row.water, widths.water),
    )
    .join("\n");

  const warningLines = report.warnings.map((w) => `  ! ${w.message}`);

  const lines = [
    headline,
    "",
    header,
    rule,
    body,
    "",
    `  ${report.comparison} (lifetime low end)`,
    "",
    `  ${report.caveat}`,
    `  ${report.tokenAccounting}`,
    `  ${report.citation}`,
    "  Totals are per-machine. Logs are local-only; a second computer is a separate total.",
  ];

  if (warningLines.length > 0) {
    lines.push("", ...warningLines);
  }

  return lines.join("\n") + "\n";
}

export function reportToJson(report: ReportData): unknown {
  return {
    scope: report.scopeLabel,
    lifetime: {
      tokens: report.lifetime.tokens,
      water_ml: {
        low: report.lifetime.water.lowMl,
        high: report.lifetime.water.highMl,
      },
      water: formatVolumeRange(report.lifetime.water.lowMl, report.lifetime.water.highMl),
    },
    breakdown: report.rows.map((row) => ({
      period: row.period,
      platform: row.platform,
      tokens: row.tokens,
      water_ml: { low: row.water.lowMl, high: row.water.highMl },
      water: formatVolumeRange(row.water.lowMl, row.water.highMl),
    })),
    comparison: report.comparison,
    caveat: report.caveat,
    token_accounting: report.tokenAccounting,
    citation: report.citation,
    warnings: report.warnings,
  };
}
