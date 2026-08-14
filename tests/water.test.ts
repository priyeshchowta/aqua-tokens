import { describe, expect, it } from "vitest";
import { formatTokens, formatVolumeRange } from "../src/format.js";
import { loadMethodology, tokensToWater, toiletFlushComparison } from "../src/water.js";

describe("water conversion", () => {
  const methodology = loadMethodology();

  it("interpolates 1.2M tokens to 12–60 L at scope-1+2", () => {
    const range = tokensToWater(1_200_000, "scope1plus2", methodology);
    expect(range.lowMl).toBe(12_000);
    expect(range.highMl).toBe(60_000);
    expect(formatVolumeRange(range.lowMl, range.highMl)).toBe("12–60 L");
    expect(range.scopeLabel).toBe("scope-1+2");
  });

  it("never returns a point estimate", () => {
    const range = tokensToWater(500, "scope1plus2", methodology);
    expect(range.lowMl).not.toBe(range.highMl);
  });

  it("uses the conservative on-site-only band for --scope1", () => {
    const range = tokensToWater(1000, "scope1", methodology);
    expect(range.lowMl).toBe(0.26);
    expect(range.highMl).toBe(0.32);
    expect(range.scopeLabel).toBe("scope-1");
  });

  it("compares the lifetime low end to toilet flushes", () => {
    expect(toiletFlushComparison(12_000, methodology)).toBe("~2 toilet flushes, conservative estimate");
    expect(toiletFlushComparison(100, methodology)).toBe("~less than 1 toilet flush, conservative estimate");
  });
});

describe("formatTokens", () => {
  it("compacts millions", () => {
    expect(formatTokens(1_200_000)).toBe("1.2M");
  });
});
