import type { UsageEvent } from "./types.js";

/**
 * v1 token-accounting rule (see water-methodology.json token_accounting).
 *
 * Counted: API-request input_tokens + output_tokens.
 * Excluded: cache_read / cache_creation.
 *
 * Cache reads reuse already-processed context; folding them into the Li et al.
 * 500–2,500 token query band would invent extra queries. Cache writes are also
 * outside that query-size band. Aqua therefore does not call the result
 * "total AI token usage" or "billed tokens".
 */
export function countedTokens(event: Pick<UsageEvent, "inputTokens" | "outputTokens">): number {
  return event.inputTokens + event.outputTokens;
}

export function isCountableEvent(event: Pick<UsageEvent, "inputTokens" | "outputTokens">): boolean {
  return countedTokens(event) > 0;
}
