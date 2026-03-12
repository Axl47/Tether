import { describe, expect, it } from "vitest";

import {
  formatCompactTokenCount,
  isCodexContextWindowV2,
  resolveCodexContextExplanation,
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

  it("flags Codex v2 snapshots", () => {
    expect(
      isCodexContextWindowV2({
        provider: "codex",
        estimationVersion: 2,
        estimationMode: "anchored",
        usedTokens: 38_700,
        effectiveTokens: 245_000,
        reportedTotalTokens: 9_300_000,
        anchorEffectiveTokens: 245_000,
        anchorEstimatedTokens: 38_700,
        anchorSource: "explicit-compaction",
        maxTokens: 258_000,
        remainingTokens: 219_300,
        usedPercent: 15,
        updatedAt: "2026-03-12T00:00:00.000Z",
      }),
    ).toBe(true);

    expect(
      isCodexContextWindowV2({
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

  it("resolves deterministic codex tooltip explanations from the server-owned mode", () => {
    expect(
      resolveCodexContextExplanation({
        provider: "codex",
        estimationVersion: 2,
        estimationMode: "direct",
        usedTokens: 87_300,
        effectiveTokens: 87_300,
        reportedTotalTokens: 1_212_700,
        maxTokens: 258_000,
        remainingTokens: 170_700,
        usedPercent: 34,
        updatedAt: "2026-03-12T00:00:00.000Z",
      }),
    ).toBe("Derived from current Codex totals with cached, output, and reasoning tokens excluded.");

    expect(
      resolveCodexContextExplanation({
        provider: "codex",
        estimationVersion: 2,
        estimationMode: "anchored",
        usedTokens: 68_700,
        effectiveTokens: 6_711_000,
        reportedTotalTokens: 9_300_000,
        anchorEffectiveTokens: 6_681_000,
        anchorEstimatedTokens: 38_700,
        anchorSource: "explicit-compaction",
        maxTokens: 258_000,
        remainingTokens: 189_300,
        usedPercent: 27,
        updatedAt: "2026-03-12T00:00:00.000Z",
      }),
    ).toBe("Estimated from an explicit compaction baseline plus new effective token growth.");
  });
});
