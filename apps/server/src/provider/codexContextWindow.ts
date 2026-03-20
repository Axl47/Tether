import type { OrchestrationContextWindow } from "@t3tools/contracts";

import { asNonNegativeInteger, asRecord } from "./contextWindowCommon.ts";

type UnknownRecord = Record<string, unknown>;
const CODEX_COMPACTION_RESET_FRACTION = 0.15;
const CODEX_ESTIMATION_VERSION = 2 as const;
type CodexAnchorSource =
  | "explicit-compaction"
  | "overflow-previous-direct"
  | "overflow-last-delta"
  | "overflow-baseline";

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

function resolveCompactionResetTokens(maxTokens: number): number {
  return normalizeUsedTokens(Math.round(maxTokens * CODEX_COMPACTION_RESET_FRACTION));
}

function previousCodexContextWindow(
  contextWindow: OrchestrationContextWindow | null | undefined,
): OrchestrationContextWindow | null {
  return contextWindow?.provider === "codex" ? contextWindow : null;
}

function isCodexContextWindowV2(
  contextWindow: OrchestrationContextWindow | null | undefined,
): contextWindow is OrchestrationContextWindow & {
  estimationVersion: 2;
  estimationMode: "direct" | "anchored";
  effectiveTokens: number;
} {
  return (
    contextWindow?.provider === "codex" &&
    contextWindow.estimationVersion === CODEX_ESTIMATION_VERSION &&
    (contextWindow.estimationMode === "direct" || contextWindow.estimationMode === "anchored") &&
    contextWindow.effectiveTokens !== undefined
  );
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

function buildCodexContextWindow(
  input: {
    maxTokens: number;
    effectiveTokens: number;
    reportedTotalTokens: number;
    reportedLastTokens: number | undefined;
    lastEffectiveTokens: number | undefined;
    inputTokens: number | undefined;
    cachedInputTokens: number | undefined;
    outputTokens: number | undefined;
    reasoningOutputTokens: number | undefined;
    updatedAt: string;
  } & (
    | {
        estimationMode: "direct";
      }
    | {
        estimationMode: "anchored";
        anchorEffectiveTokens: number;
        anchorEstimatedTokens: number;
        anchorSource: CodexAnchorSource;
      }
  ),
): OrchestrationContextWindow {
  const usedTokens =
    input.estimationMode === "anchored"
      ? normalizeUsedTokens(
          input.anchorEstimatedTokens +
            Math.max(0, input.effectiveTokens - input.anchorEffectiveTokens),
        )
      : normalizeUsedTokens(input.effectiveTokens);
  const remainingTokens = Math.max(0, input.maxTokens - usedTokens);
  const usedPercent = Math.max(0, Math.round((usedTokens / input.maxTokens) * 100));

  return {
    provider: "codex",
    estimationVersion: CODEX_ESTIMATION_VERSION,
    estimationMode: input.estimationMode,
    usedTokens,
    effectiveTokens: input.effectiveTokens,
    reportedTotalTokens: input.reportedTotalTokens,
    ...(input.reportedLastTokens !== undefined
      ? { reportedLastTokens: input.reportedLastTokens }
      : {}),
    ...(input.lastEffectiveTokens !== undefined
      ? { lastEffectiveTokens: input.lastEffectiveTokens }
      : {}),
    ...(input.estimationMode === "anchored"
      ? {
          anchorEffectiveTokens: input.anchorEffectiveTokens,
          anchorEstimatedTokens: input.anchorEstimatedTokens,
          anchorSource: input.anchorSource,
        }
      : {}),
    maxTokens: input.maxTokens,
    remainingTokens,
    usedPercent,
    ...(input.inputTokens !== undefined ? { inputTokens: input.inputTokens } : {}),
    ...(input.cachedInputTokens !== undefined
      ? { cachedInputTokens: input.cachedInputTokens }
      : {}),
    ...(input.outputTokens !== undefined ? { outputTokens: input.outputTokens } : {}),
    ...(input.reasoningOutputTokens !== undefined
      ? { reasoningOutputTokens: input.reasoningOutputTokens }
      : {}),
    updatedAt: input.updatedAt,
  };
}

function anchorFromOverflow(input: {
  effectiveTokens: number;
  lastEffectiveTokens: number | undefined;
  maxTokens: number;
  previousContextWindow: OrchestrationContextWindow | null;
}): {
  anchorEffectiveTokens: number;
  anchorEstimatedTokens: number;
  anchorSource: CodexAnchorSource;
} {
  const baseline = resolveCompactionResetTokens(input.maxTokens);
  const previousContextWindow = previousCodexContextWindow(input.previousContextWindow);

  if (
    isCodexContextWindowV2(previousContextWindow) &&
    previousContextWindow.estimationMode === "direct"
  ) {
    return {
      anchorEffectiveTokens: previousContextWindow.effectiveTokens,
      anchorEstimatedTokens: baseline,
      anchorSource: "overflow-previous-direct",
    };
  }

  if (input.lastEffectiveTokens !== undefined) {
    return {
      anchorEffectiveTokens: Math.max(0, input.effectiveTokens - input.lastEffectiveTokens),
      anchorEstimatedTokens: baseline,
      anchorSource: "overflow-last-delta",
    };
  }

  return {
    anchorEffectiveTokens: input.effectiveTokens,
    anchorEstimatedTokens: baseline,
    anchorSource: "overflow-baseline",
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
  const sharedFields = {
    maxTokens,
    effectiveTokens: effectiveReportedTotal,
    reportedTotalTokens,
    reportedLastTokens,
    lastEffectiveTokens: effectiveReportedLastTotal,
    inputTokens,
    cachedInputTokens,
    outputTokens,
    reasoningOutputTokens,
    updatedAt,
  } as const;

  if (effectiveReportedTotal <= maxTokens) {
    return buildCodexContextWindow({
      ...sharedFields,
      estimationMode: "direct",
    });
  }

  if (
    isCodexContextWindowV2(previousCodexWindow) &&
    previousCodexWindow.estimationMode === "anchored" &&
    previousCodexWindow.anchorEffectiveTokens !== undefined &&
    previousCodexWindow.anchorEstimatedTokens !== undefined &&
    previousCodexWindow.anchorSource !== undefined
  ) {
    return buildCodexContextWindow({
      ...sharedFields,
      estimationMode: "anchored",
      anchorEffectiveTokens: previousCodexWindow.anchorEffectiveTokens,
      anchorEstimatedTokens: previousCodexWindow.anchorEstimatedTokens,
      anchorSource: previousCodexWindow.anchorSource,
    });
  }

  const anchor = anchorFromOverflow({
    effectiveTokens: effectiveReportedTotal,
    lastEffectiveTokens: effectiveReportedLastTotal,
    maxTokens,
    previousContextWindow: previousCodexWindow,
  });

  return buildCodexContextWindow({
    ...sharedFields,
    estimationMode: "anchored",
    anchorEffectiveTokens: anchor.anchorEffectiveTokens,
    anchorEstimatedTokens: anchor.anchorEstimatedTokens,
    anchorSource: anchor.anchorSource,
  });
}

export function compactCodexContextWindow(
  contextWindow: OrchestrationContextWindow | null | undefined,
  updatedAt: string,
): OrchestrationContextWindow | null {
  const previousContextWindow = previousCodexContextWindow(contextWindow);
  if (
    !isCodexContextWindowV2(previousContextWindow) ||
    previousContextWindow.maxTokens <= 0 ||
    previousContextWindow.effectiveTokens === undefined
  ) {
    return null;
  }

  return buildCodexContextWindow({
    maxTokens: previousContextWindow.maxTokens,
    effectiveTokens: previousContextWindow.effectiveTokens,
    reportedTotalTokens:
      previousContextWindow.reportedTotalTokens ?? previousContextWindow.usedTokens,
    reportedLastTokens: previousContextWindow.reportedLastTokens,
    lastEffectiveTokens: previousContextWindow.lastEffectiveTokens,
    inputTokens: previousContextWindow.inputTokens,
    cachedInputTokens: previousContextWindow.cachedInputTokens,
    outputTokens: previousContextWindow.outputTokens,
    reasoningOutputTokens: previousContextWindow.reasoningOutputTokens,
    updatedAt,
    estimationMode: "anchored",
    anchorEffectiveTokens: previousContextWindow.effectiveTokens,
    anchorEstimatedTokens: resolveCompactionResetTokens(previousContextWindow.maxTokens),
    anchorSource: "explicit-compaction",
  });
}
