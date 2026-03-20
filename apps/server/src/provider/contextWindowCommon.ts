type UnknownRecord = Record<string, unknown>;

export function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" ? (value as UnknownRecord) : null;
}

export function asNonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

export function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function sumDefined(values: ReadonlyArray<number | undefined>): number | undefined {
  let total = 0;
  let hasValue = false;

  for (const value of values) {
    if (value === undefined) {
      continue;
    }
    total += value;
    hasValue = true;
  }

  return hasValue ? total : undefined;
}

export function resolveContextUsedTokens({
  totalTokens,
  inputTokens,
  cachedInputTokens,
  outputTokens,
  reasoningOutputTokens,
  maxTokens,
}: {
  totalTokens: number | undefined;
  inputTokens: number | undefined;
  cachedInputTokens: number | undefined;
  outputTokens: number | undefined;
  reasoningOutputTokens: number | undefined;
  maxTokens: number | undefined;
}): number | undefined {
  const derivedContextTokens =
    sumDefined([inputTokens, outputTokens]) ??
    (outputTokens === undefined ? sumDefined([inputTokens, reasoningOutputTokens]) : undefined);

  if (totalTokens === undefined) {
    return derivedContextTokens;
  }

  if (
    cachedInputTokens !== undefined &&
    derivedContextTokens !== undefined &&
    totalTokens === derivedContextTokens + cachedInputTokens
  ) {
    return derivedContextTokens;
  }

  if (
    maxTokens !== undefined &&
    derivedContextTokens !== undefined &&
    totalTokens > maxTokens &&
    derivedContextTokens <= maxTokens
  ) {
    return derivedContextTokens;
  }

  return totalTokens;
}
