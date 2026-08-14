import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Methodology, ScopeId, WaterRange } from "./types.js";

function packageRoot(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function loadMethodology(filePath?: string): Methodology {
  const resolved = filePath ?? path.join(packageRoot(), "water-methodology.json");
  const raw = JSON.parse(readFileSync(resolved, "utf8")) as unknown;
  if (!isPlainMethodology(raw)) {
    throw new Error(`invalid water-methodology.json: ${resolved}`);
  }
  return raw;
}

function isPlainMethodology(value: unknown): value is Methodology {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Methodology;
  return (
    typeof v.caveat === "string" &&
    typeof v.citation === "string" &&
    isScope(v.scopes?.scope1plus2) &&
    isScope(v.scopes?.scope1) &&
    isFiniteNumber(v.comparisons?.toilet_flush_ml)
  );
}

function isScope(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const v = value as { ml_per_1000_tokens_low?: unknown; ml_per_1000_tokens_high?: unknown; label?: unknown };
  return (
    typeof v.label === "string" &&
    isFiniteNumber(v.ml_per_1000_tokens_low) &&
    isFiniteNumber(v.ml_per_1000_tokens_high)
  );
}

export function tokensToWater(
  tokens: number,
  scope: ScopeId,
  methodology: Methodology,
): WaterRange {
  const spec = methodology.scopes[scope];
  const ref = methodology.interpolation.reference_tokens;
  return {
    lowMl: (tokens / ref) * spec.ml_per_1000_tokens_low,
    highMl: (tokens / ref) * spec.ml_per_1000_tokens_high,
    scopeLabel: spec.label,
    scopeId: scope,
  };
}

export function toiletFlushComparison(lowMl: number, methodology: Methodology): string {
  const perFlush = methodology.comparisons.toilet_flush_ml;
  const flushes = lowMl / perFlush;
  if (flushes < 1) {
    return "~less than 1 toilet flush, conservative estimate";
  }
  const rounded = flushes >= 10 ? Math.round(flushes) : Number(flushes.toFixed(1));
  const noun = rounded === 1 ? "toilet flush" : "toilet flushes";
  return `~${rounded} ${noun}, conservative estimate`;
}
