import type { OrchestrationContextWindow } from "@t3tools/contracts";

import { asNonNegativeInteger, asRecord } from "./contextWindowCommon.ts";

type UnknownRecord = Record<string, unknown>;
const CODEX_COMPACTION_RESET_FRACTION = 0.15;

function compactRecords(
  values: ReadonlyArray<UnknownRecord | null | undefined>,
): ReadonlyArray<UnknownRecord> {
  return values.filter((value): value is UnknownRecord => value !== null && value !== undefined);
}

function pickValue(record: UnknownRecord | null, keys: ReadonlyArray<string>): unknown {
  if (!record) {
    return undefined;
  }
  for (const key of keys) {
    if (key in record) {
      return record[key];
    }
  }
  return undefined;
}

function pickNumber(record: UnknownRecord | null, keys: ReadonlyArray<string>): number | undefined {
  return asNonNegativeInteger(pickValue(record, keys));
}

function pickFirstRecord(
  records: ReadonlyArray<UnknownRecord>,
  keys: ReadonlyArray<string>,
): UnknownRecord | null {
  for (const record of records) {
    const value = asRecord(pickValue(record, keys));
    if (value) {
      return value;
    }
  }
  return null;
}

function recordHasTotalTokenFields(record: UnknownRecord): boolean {
  return pickNumber(record, ["total_tokens", "totalTokens"]) !== undefined;
}

function resolveTotalUsageRecord(records: ReadonlyArray<UnknownRecord>): UnknownRecord | null {
  const nestedRecord = pickFirstRecord(records, [
    "total_token_usage",
    "totalTokenUsage",
    "usage",
    "total_usage",
    "total",
  ]);
  if (nestedRecord) {
    return nestedRecord;
  }

  return records.find(recordHasTotalTokenFields) ?? null;
}

function resolveLastUsageRecord(records: ReadonlyArray<UnknownRecord>): UnknownRecord | null {
  const nestedRecord = pickFirstRecord(records, ["last_token_usage", "lastTokenUsage", "last"]);
  if (nestedRecord) {
    return nestedRecord;
  }

  return null;
}

function pickFirstNumber(
  records: ReadonlyArray<UnknownRecord>,
  keys: ReadonlyArray<string>,
): number | undefined {
  for (const record of records) {
    const value = pickNumber(record, keys);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function normalizeUsedTokens(usedTokens: number): number {
  return Math.max(0, usedTokens);
}

function estimateUsedTokensFromReportedTotal(effectiveReportedTotal: number): number {
  return normalizeUsedTokens(effectiveReportedTotal);
}

function resolveCompactionResetTokens(maxTokens: number): number {
  return normalizeUsedTokens(Math.round(maxTokens * CODEX_COMPACTION_RESET_FRACTION));
}

function previousCodexContextWindow(
  contextWindow: OrchestrationContextWindow | null | undefined,
): OrchestrationContextWindow | null {
  return contextWindow?.provider === "codex" ? contextWindow : null;
}

function resolveEffectiveReportedTotal(
  reportedInputTokens: number | undefined,
  reportedTotalTokens: number,
  cachedInputTokens: number | undefined,
  outputTokens: number | undefined,
  reasoningOutputTokens: number | undefined,
): number {
  const promptSourceTokens = reportedInputTokens ?? reportedTotalTokens;
  return Math.max(
    0,
    promptSourceTokens -
      (cachedInputTokens ?? 0) -
      (outputTokens ?? 0) -
      (reasoningOutputTokens ?? 0),
  );
}

function resolveCompactionAnchoredEstimate(input: {
  effectiveReportedTotal: number;
  effectiveReportedLastTotal: number | undefined;
  maxTokens: number;
  previousContextWindow: OrchestrationContextWindow | null;
}): {
  usedTokens: number;
  compactionAnchorNonCachedTokens?: number;
  compactionAnchorUsedTokens?: number;
} {
  const { effectiveReportedTotal, effectiveReportedLastTotal, maxTokens, previousContextWindow } =
    input;
  const anchorNonCachedTokens = previousContextWindow?.compactionAnchorNonCachedTokens;
  const anchorUsedTokens = previousContextWindow?.compactionAnchorUsedTokens;

  if (
    anchorNonCachedTokens === undefined ||
    anchorUsedTokens === undefined ||
    effectiveReportedTotal < anchorNonCachedTokens
  ) {
    const previousReportedTotalTokens =
      previousContextWindow?.reportedTotalTokens ?? previousContextWindow?.usedTokens;
    const canRecoverOverflowEstimate =
      effectiveReportedTotal >= maxTokens ||
      (previousReportedTotalTokens !== undefined &&
        previousContextWindow !== null &&
        previousReportedTotalTokens >= previousContextWindow.maxTokens);

    if (canRecoverOverflowEstimate) {
      const recoveredAnchorUsedTokens = resolveCompactionResetTokens(maxTokens);
      const recoveredAnchorNonCachedTokens = Math.max(
        0,
        effectiveReportedTotal - (effectiveReportedLastTotal ?? 0),
      );
      return {
        usedTokens: normalizeUsedTokens(
          recoveredAnchorUsedTokens + (effectiveReportedLastTotal ?? 0),
        ),
        compactionAnchorNonCachedTokens: recoveredAnchorNonCachedTokens,
        compactionAnchorUsedTokens: recoveredAnchorUsedTokens,
      };
    }

    return {
      usedTokens: estimateUsedTokensFromReportedTotal(effectiveReportedTotal),
    };
  }

  const growthSinceCompaction = Math.max(0, effectiveReportedTotal - anchorNonCachedTokens);
  return {
    usedTokens: normalizeUsedTokens(anchorUsedTokens + growthSinceCompaction),
    compactionAnchorNonCachedTokens: anchorNonCachedTokens,
    compactionAnchorUsedTokens: anchorUsedTokens,
  };
}

export function normalizeCodexContextWindow(
  usage: unknown,
  updatedAt: string,
  previousContextWindow?: OrchestrationContextWindow | null,
): OrchestrationContextWindow | null {
  const payload = asRecord(usage);
  const info = asRecord(pickValue(payload, ["info"]));
  const tokenUsage = asRecord(pickValue(payload, ["tokenUsage", "token_usage"]));
  const infoTokenUsage = asRecord(pickValue(info, ["tokenUsage", "token_usage"]));
  const records = compactRecords([payload, info, tokenUsage, infoTokenUsage]);
  const totalUsage = resolveTotalUsageRecord(records);
  const lastUsage = resolveLastUsageRecord(records);
  const maxTokens = pickFirstNumber(records, [
    "model_context_window",
    "modelContextWindow",
    "context_window",
  ]);
  const reportedTotalTokens = pickNumber(totalUsage, ["total_tokens", "totalTokens"]);
  const inputTokens = pickNumber(totalUsage, ["input_tokens", "inputTokens"]);
  const cachedInputTokens = pickNumber(totalUsage, ["cached_input_tokens", "cachedInputTokens"]);
  const outputTokens = pickNumber(totalUsage, ["output_tokens", "outputTokens"]);
  const reasoningOutputTokens = pickNumber(totalUsage, [
    "reasoning_output_tokens",
    "reasoningOutputTokens",
  ]);
  const reportedLastTokens = pickNumber(lastUsage, ["total_tokens", "totalTokens"]);
  const lastInputTokens = pickNumber(lastUsage, ["input_tokens", "inputTokens"]);
  const lastCachedInputTokens = pickNumber(lastUsage, ["cached_input_tokens", "cachedInputTokens"]);
  const lastOutputTokens = pickNumber(lastUsage, ["output_tokens", "outputTokens"]);
  const lastReasoningOutputTokens = pickNumber(lastUsage, [
    "reasoning_output_tokens",
    "reasoningOutputTokens",
  ]);
  const previousCodexWindow = previousCodexContextWindow(previousContextWindow);

  if (reportedTotalTokens === undefined || maxTokens === undefined || maxTokens <= 0) {
    return null;
  }

  const effectiveReportedTotal = resolveEffectiveReportedTotal(
    inputTokens,
    reportedTotalTokens,
    cachedInputTokens,
    outputTokens,
    reasoningOutputTokens,
  );
  const effectiveReportedLastTotal =
    reportedLastTokens === undefined
      ? undefined
      : resolveEffectiveReportedTotal(
          lastInputTokens,
          reportedLastTokens,
          lastCachedInputTokens,
          lastOutputTokens,
          lastReasoningOutputTokens,
        );
  const estimatedUsage = resolveCompactionAnchoredEstimate({
    effectiveReportedTotal,
    effectiveReportedLastTotal,
    maxTokens,
    previousContextWindow: previousCodexWindow,
  });
  const usedTokens = estimatedUsage.usedTokens;
  const remainingTokens = Math.max(0, maxTokens - usedTokens);
  const usedPercent = Math.max(0, Math.round((usedTokens / maxTokens) * 100));

  return {
    provider: "codex",
    usedTokens,
    reportedTotalTokens,
    ...(reportedLastTokens !== undefined ? { reportedLastTokens } : {}),
    ...(effectiveReportedLastTotal !== undefined
      ? { reportedLastEffectiveTokens: effectiveReportedLastTotal }
      : {}),
    ...(estimatedUsage.compactionAnchorNonCachedTokens !== undefined
      ? { compactionAnchorNonCachedTokens: estimatedUsage.compactionAnchorNonCachedTokens }
      : {}),
    ...(estimatedUsage.compactionAnchorUsedTokens !== undefined
      ? { compactionAnchorUsedTokens: estimatedUsage.compactionAnchorUsedTokens }
      : {}),
    maxTokens,
    remainingTokens,
    usedPercent,
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(cachedInputTokens !== undefined ? { cachedInputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
    ...(reasoningOutputTokens !== undefined ? { reasoningOutputTokens } : {}),
    updatedAt,
  };
}

export function compactCodexContextWindow(
  contextWindow: OrchestrationContextWindow | null | undefined,
  updatedAt: string,
): OrchestrationContextWindow | null {
  const previousContextWindow = previousCodexContextWindow(contextWindow);
  if (!previousContextWindow || previousContextWindow.maxTokens <= 0) {
    return null;
  }

  const reportedTotalTokens =
    previousContextWindow.reportedTotalTokens ??
    previousContextWindow.usedTokens + (previousContextWindow.cachedInputTokens ?? 0);
  const compactionAnchorNonCachedTokens = resolveEffectiveReportedTotal(
    previousContextWindow.inputTokens,
    reportedTotalTokens,
    previousContextWindow.cachedInputTokens,
    previousContextWindow.outputTokens,
    previousContextWindow.reasoningOutputTokens,
  );
  const compactionAnchorUsedTokens = resolveCompactionResetTokens(previousContextWindow.maxTokens);
  const usedTokens = compactionAnchorUsedTokens;
  const remainingTokens = Math.max(0, previousContextWindow.maxTokens - usedTokens);
  const usedPercent = Math.max(0, Math.round((usedTokens / previousContextWindow.maxTokens) * 100));

  return {
    ...previousContextWindow,
    usedTokens,
    reportedTotalTokens,
    compactionAnchorNonCachedTokens,
    compactionAnchorUsedTokens,
    remainingTokens,
    usedPercent,
    updatedAt,
  };
}
