import type { OrchestrationContextWindow } from "@t3tools/contracts";

import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";
import {
  formatCompactTokenCount,
  isCodexCompactionEstimate,
  resolveContextTokensUsed,
  resolveContextWindowSeverity,
} from "./ContextWindowIndicator.logic";
import { cn } from "~/lib/utils";

function tokenBreakdown(contextWindow: OrchestrationContextWindow): string | null {
  const parts = [
    contextWindow.inputTokens !== undefined
      ? `Input ${formatCompactTokenCount(contextWindow.inputTokens)}`
      : null,
    contextWindow.cachedInputTokens !== undefined
      ? `cached ${formatCompactTokenCount(contextWindow.cachedInputTokens)}`
      : null,
    contextWindow.outputTokens !== undefined
      ? `output ${formatCompactTokenCount(contextWindow.outputTokens)}`
      : null,
    contextWindow.reasoningOutputTokens !== undefined
      ? `reasoning ${formatCompactTokenCount(contextWindow.reasoningOutputTokens)}`
      : null,
  ].filter((value): value is string => value !== null);

  return parts.length > 0 ? parts.join(", ") : null;
}

function deriveCodexPromptFootprint(contextWindow: OrchestrationContextWindow): number {
  const promptSourceTokens =
    contextWindow.inputTokens ?? contextWindow.reportedTotalTokens ?? contextWindow.usedTokens;
  return Math.max(
    0,
    promptSourceTokens -
      (contextWindow.cachedInputTokens ?? 0) -
      (contextWindow.outputTokens ?? 0) -
      (contextWindow.reasoningOutputTokens ?? 0),
  );
}

export default function ContextWindowIndicator(props: {
  contextWindow: OrchestrationContextWindow;
}) {
  const { contextWindow } = props;
  const isCodexEstimate = contextWindow.provider === "codex";
  const isCompactionEstimate = isCodexCompactionEstimate(contextWindow);
  const derivedCodexPromptFootprint = isCodexEstimate
    ? deriveCodexPromptFootprint(contextWindow)
    : contextWindow.usedTokens;
  const hasLegacyRawCodexSnapshot =
    isCodexEstimate &&
    !isCompactionEstimate &&
    derivedCodexPromptFootprint < contextWindow.usedTokens;
  const hasLegacyCodexFallback =
    isCodexEstimate &&
    !isCompactionEstimate &&
    contextWindow.usedTokens >= contextWindow.maxTokens &&
    (contextWindow.reportedLastEffectiveTokens ?? contextWindow.reportedLastTokens) !== undefined;
  const displayedCodexUsedTokens = hasLegacyCodexFallback
    ? Math.max(
        0,
        Math.round(contextWindow.maxTokens * 0.15) +
          (contextWindow.reportedLastEffectiveTokens ?? contextWindow.reportedLastTokens ?? 0),
      )
    : hasLegacyRawCodexSnapshot
      ? derivedCodexPromptFootprint
      : contextWindow.usedTokens;
  const displayedUsedPercent = isCodexEstimate
    ? Math.max(0, Math.round((displayedCodexUsedTokens / contextWindow.maxTokens) * 100))
    : contextWindow.usedPercent;
  const remainingPercent = Math.max(0, 100 - displayedUsedPercent);
  const contextTokensUsed = isCodexEstimate
    ? displayedCodexUsedTokens
    : resolveContextTokensUsed(contextWindow);
  const severity = resolveContextWindowSeverity(displayedUsedPercent);
  const badgeClassName =
    severity === "danger"
      ? "border-destructive/28 bg-destructive/8 text-destructive-foreground hover:bg-destructive/12"
      : severity === "warning"
        ? "border-warning/28 bg-warning/8 text-warning-foreground hover:bg-warning/12"
        : "border-border/70 bg-background text-muted-foreground hover:bg-accent hover:text-foreground";
  const breakdown = tokenBreakdown(contextWindow);

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={isCodexEstimate ? "Estimated context window usage" : "Context window usage"}
            className={cn(
              "inline-flex h-8 items-center rounded-full border px-2.5 text-xs font-medium transition-colors sm:h-7",
              badgeClassName,
            )}
          >
            {isCodexEstimate ? `${displayedUsedPercent}%` : `${contextWindow.usedPercent}%`}
          </button>
        }
      />
      <TooltipPopup side="top" align="end" className="max-w-72 whitespace-normal px-0 py-0">
        <div className="space-y-1.5 px-3 py-2.5 leading-tight">
          <p className="font-medium text-foreground">
            {isCodexEstimate ? "Estimated context window" : "Context window"}
          </p>
          {isCodexEstimate ? (
            <>
              <p>
                {displayedUsedPercent}% used ({remainingPercent}% left)
              </p>
              <p>
                Estimated usage: {formatCompactTokenCount(displayedCodexUsedTokens)} /{" "}
                {formatCompactTokenCount(contextWindow.maxTokens)} tokens
              </p>
              <p className="text-muted-foreground">
                {hasLegacyCodexFallback
                  ? "Approximated from the latest reported turn while waiting for a refreshed compaction anchor."
                  : hasLegacyRawCodexSnapshot
                    ? "Derived from the current Codex totals with cached, output, and reasoning tokens removed."
                    : isCompactionEstimate
                      ? "Estimated from a 15% post-compaction reset plus new non-cached token growth."
                      : "Estimated from Codex reported totals with cached, output, and reasoning tokens excluded."}
              </p>
              {contextWindow.reportedTotalTokens !== undefined ? (
                <p>
                  Reported total: {formatCompactTokenCount(contextWindow.reportedTotalTokens)}{" "}
                  tokens
                </p>
              ) : null}
              {contextWindow.reportedLastTokens !== undefined ? (
                <p>
                  Reported last turn: {formatCompactTokenCount(contextWindow.reportedLastTokens)}{" "}
                  tokens
                </p>
              ) : null}
              {contextWindow.reportedLastEffectiveTokens !== undefined ? (
                <p>
                  Estimated last-turn footprint:{" "}
                  {formatCompactTokenCount(contextWindow.reportedLastEffectiveTokens)} tokens
                </p>
              ) : null}
              <p>Model context window: {formatCompactTokenCount(contextWindow.maxTokens)} tokens</p>
            </>
          ) : (
            <>
              <p>
                {contextWindow.usedPercent}% used ({remainingPercent}% left)
              </p>
              <p>
                {formatCompactTokenCount(contextTokensUsed)} /{" "}
                {formatCompactTokenCount(contextWindow.maxTokens)} tokens used
              </p>
            </>
          )}
          {breakdown ? (
            <p className="text-muted-foreground">
              {isCodexEstimate ? `Reported totals: ${breakdown}` : breakdown}
            </p>
          ) : null}
        </div>
      </TooltipPopup>
    </Tooltip>
  );
}
