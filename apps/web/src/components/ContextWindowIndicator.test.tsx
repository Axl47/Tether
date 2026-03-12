import { describe, expect, it } from "vitest";

import {
  formatCompactTokenCount,
  hasReportedSessionTokenTotal,
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
        usedTokens: 9_300_000,
        maxTokens: 258_000,
        remainingTokens: 0,
        usedPercent: 100,
        updatedAt: "2026-03-12T00:00:00.000Z",
      }),
    ).toBe(258_000);
  });

  it("flags when the reported total differs from the context footprint", () => {
    expect(
      hasReportedSessionTokenTotal({
        provider: "codex",
        usedTokens: 9_300_000,
        maxTokens: 258_000,
        remainingTokens: 0,
        usedPercent: 100,
        updatedAt: "2026-03-12T00:00:00.000Z",
      }),
    ).toBe(true);

    expect(
      hasReportedSessionTokenTotal({
        provider: "codex",
        usedTokens: 119_000,
        maxTokens: 258_000,
        remainingTokens: 139_000,
        usedPercent: 46,
        updatedAt: "2026-03-12T00:00:00.000Z",
      }),
    ).toBe(false);
  });
});
