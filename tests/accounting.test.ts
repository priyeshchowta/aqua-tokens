import { describe, expect, it } from "vitest";
import { countedTokens, isCountableEvent } from "../src/accounting.js";
import { loadMethodology } from "../src/water.js";

describe("v1 token accounting", () => {
  it("counts input+output and excludes cache fields", () => {
    expect(
      countedTokens({
        inputTokens: 200,
        outputTokens: 50,
      }),
    ).toBe(250);
    expect(
      countedTokens({
        inputTokens: 200,
        outputTokens: 50,
      }),
    ).not.toBe(200 + 50 + 12000);
    expect(isCountableEvent({ inputTokens: 0, outputTokens: 0 })).toBe(false);
  });

  it("is documented on the methodology object", () => {
    const rule = loadMethodology().token_accounting;
    expect(rule.counted).toEqual(["input_tokens", "output_tokens"]);
    expect(rule.excluded).toEqual(["cache_read_tokens", "cache_creation_tokens"]);
    expect(rule.caveat).toMatch(/Cache reads and cache writes/i);
    expect(rule.label).toMatch(/cache read\/write excluded/i);
  });
});
