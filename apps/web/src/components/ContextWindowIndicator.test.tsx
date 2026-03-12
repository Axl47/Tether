import { describe, expect, it } from "vitest";

import {
  formatCompactTokenCount,
  isCodexCompactionEstimate,
  resolveContextTokensUsed,
  resolveContextWindowSeverity,
} from "./ContextWindowIndicator.logic";

describe("ContextWindowIndicator helpers", () => {
  it("formats compact token counts using lowercase suffixes", () => {
    expect(formatCompactTokenCount(999)).toBe("999");
    expect(formatCompactTokenCount(1_250)).toBe("1.3k");
    expect(formatCompactTokenCount(119_000)).toBe("119k");
    expect(formatCompactTokenCount(1_250_000)).toBe("1.3m");
  });

  it("maps usage thresholds to display severities", () => {
    expect(resolveContextWindowSeverity(46)).toBe("default");
    expect(resolveContextWindowSeverity(70)).toBe("warning");
    expect(resolveContextWindowSeverity(90)).toBe("danger");
  });

  it("derives the context token footprint from remaining capacity", () => {
    expect(
      resolveContextTokensUsed({
        provider: "codex",
        usedTokens: 38_700,
        reportedTotalTokens: 9_300_000,
        maxTokens: 258_000,
        remainingTokens: 219_300,
        usedPercent: 15,
        updatedAt: "2026-03-12T00:00:00.000Z",
      }),
    ).toBe(38_700);
  });

  it("flags Codex estimates that are anchored to a compaction reset", () => {
    expect(
      isCodexCompactionEstimate({
        provider: "codex",
        usedTokens: 38_700,
        reportedTotalTokens: 9_300_000,
        compactionAnchorNonCachedTokens: 245_000,
        compactionAnchorUsedTokens: 38_700,
        maxTokens: 258_000,
        remainingTokens: 219_300,
        usedPercent: 15,
        updatedAt: "2026-03-12T00:00:00.000Z",
      }),
    ).toBe(true);

    expect(
      isCodexCompactionEstimate({
        provider: "codex",
        usedTokens: 119_000,
        reportedTotalTokens: 119_000,
        maxTokens: 258_000,
        remainingTokens: 139_000,
        usedPercent: 46,
        updatedAt: "2026-03-12T00:00:00.000Z",
      }),
    ).toBe(false);
  });
});
