import { TurnId } from "@t3tools/contracts";

export interface DiffRouteSearch {
  diff?: "1" | 0;
  diffTurnId?: TurnId;
  diffFilePath?: string;
}

const EMPTY_DIFF_ROUTE_SEARCH: DiffRouteSearch = Object.freeze({});
const DIFF_ROUTE_SEARCH_CACHE_SEPARATOR = "\u0000";

let lastDiffRouteSearchKey: string | null = null;
let lastDiffRouteSearchValue: DiffRouteSearch = EMPTY_DIFF_ROUTE_SEARCH;

function isDiffOpenValue(value: unknown): boolean {
  return value === "1" || value === 1 || value === true;
}

function normalizeSearchString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function stripDiffSearchParams<T extends Record<string, unknown>>(
  params: T,
): Omit<T, "diff" | "diffTurnId" | "diffFilePath"> {
  const { diff: _diff, diffTurnId: _diffTurnId, diffFilePath: _diffFilePath, ...rest } = params;
  return rest as Omit<T, "diff" | "diffTurnId" | "diffFilePath">;
}

export function closeDiffSearchParams<T extends Record<string, unknown>>(
  params: T,
): Omit<T, "diff" | "diffTurnId" | "diffFilePath"> & { diff: 0 } {
  return {
    ...stripDiffSearchParams(params),
    // Keep an explicit closed sentinel so route search retention does not
    // rehydrate a stale open diff panel during close navigations.
    diff: 0,
  };
}

export function clearDiffSearchParams<T extends Record<string, unknown>>(
  params: T,
): Omit<T, "diff" | "diffTurnId" | "diffFilePath"> & {
  diff: undefined;
  diffTurnId: undefined;
  diffFilePath: undefined;
} {
  return {
    ...stripDiffSearchParams(params),
    diff: undefined,
    diffTurnId: undefined,
    diffFilePath: undefined,
  };
}

export function parseDiffRouteSearch(search: Record<string, unknown>): DiffRouteSearch {
  const diff = isDiffOpenValue(search.diff) ? "1" : undefined;
  const diffTurnIdRaw = diff ? normalizeSearchString(search.diffTurnId) : undefined;
  const diffTurnId = diffTurnIdRaw ? TurnId.make(diffTurnIdRaw) : undefined;
  const diffFilePath = diff && diffTurnId ? normalizeSearchString(search.diffFilePath) : undefined;
  const nextKey = [diff ?? "", diffTurnId ?? "", diffFilePath ?? ""].join(
    DIFF_ROUTE_SEARCH_CACHE_SEPARATOR,
  );

  if (lastDiffRouteSearchKey === nextKey) {
    return lastDiffRouteSearchValue;
  }

  lastDiffRouteSearchKey = nextKey;
  lastDiffRouteSearchValue =
    diff || diffTurnId || diffFilePath
      ? {
          ...(diff ? { diff } : {}),
          ...(diffTurnId ? { diffTurnId } : {}),
          ...(diffFilePath ? { diffFilePath } : {}),
        }
      : EMPTY_DIFF_ROUTE_SEARCH;

  return lastDiffRouteSearchValue;
}
