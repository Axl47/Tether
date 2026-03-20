import type { OrchestrationContextWindow } from "@t3tools/contracts";

export type ContextWindowSeverity = "default" | "warning" | "danger";

export function resolveContextWindowSeverity(usedPercent: number): ContextWindowSeverity {
  if (usedPercent >= 90) {
    return "danger";
  }
  if (usedPercent >= 70) {
    return "warning";
  }
  return "default";
}

export function formatCompactTokenCount(value: number): string {
  if (value >= 1_000_000) {
    const millions = Math.round((value / 1_000_000) * 10) / 10;
    return `${Number.isInteger(millions) ? millions.toFixed(0) : millions.toFixed(1)}m`;
  }
  if (value >= 1_000) {
    const thousands = value / 1_000;
    const rounded = thousands >= 100 ? Math.round(thousands) : Math.round(thousands * 10) / 10;
    return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}k`;
  }
  return value.toLocaleString("en-US");
}

export function resolveContextTokensUsed(contextWindow: OrchestrationContextWindow): number {
  return Math.max(
    0,
    Math.min(contextWindow.maxTokens, contextWindow.maxTokens - contextWindow.remainingTokens),
  );
}

export function isCodexContextWindowV2(contextWindow: OrchestrationContextWindow): boolean {
  return contextWindow.provider === "codex" && contextWindow.estimationVersion === 2;
}

export function resolveCodexContextExplanation(contextWindow: OrchestrationContextWindow): string {
  if (!isCodexContextWindowV2(contextWindow)) {
    return "Derived from current Codex totals with cached, output, and reasoning tokens excluded.";
  }

  if (contextWindow.estimationMode === "direct") {
    return "Derived from current Codex totals with cached, output, and reasoning tokens excluded.";
  }

  switch (contextWindow.anchorSource) {
    case "explicit-compaction":
      return "Estimated from an explicit compaction baseline plus new effective token growth.";
    case "overflow-previous-direct":
      return "Estimated from the last known under-window footprint plus new effective token growth.";
    case "overflow-last-delta":
      return "Estimated from the latest turn delta after overflow.";
    case "overflow-baseline":
    default:
      return "Estimated from a baseline because Codex overflowed without enough prior detail.";
  }
}
