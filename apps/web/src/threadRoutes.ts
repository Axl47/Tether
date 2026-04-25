import { scopeThreadRef } from "@t3tools/client-runtime";
import type { EnvironmentId, ScopedThreadRef, ThreadId } from "@t3tools/contracts";
import type { DraftId } from "./composerDraftStore";

export type ThreadRouteTarget =
  | {
      kind: "server";
      threadRef: ScopedThreadRef;
    }
  | {
      kind: "draft";
      draftId: DraftId;
    };

const THREAD_ROUTE_CACHE_SEPARATOR = "\u0000";

let lastThreadRouteRefKey: string | null = null;
let lastThreadRouteRefValue: ScopedThreadRef | null = null;
let lastThreadRouteTargetKey: string | null = null;
let lastThreadRouteTargetValue: ThreadRouteTarget | null = null;

export function buildThreadRouteParams(ref: ScopedThreadRef): {
  environmentId: EnvironmentId;
  threadId: ThreadId;
} {
  return {
    environmentId: ref.environmentId,
    threadId: ref.threadId,
  };
}

export function buildDraftThreadRouteParams(draftId: DraftId): {
  draftId: DraftId;
} {
  return { draftId };
}

export function resolveThreadRouteRef(
  params: Partial<Record<"environmentId" | "threadId", string | undefined>>,
): ScopedThreadRef | null {
  if (!params.environmentId || !params.threadId) {
    return null;
  }

  const nextKey = `${params.environmentId}${THREAD_ROUTE_CACHE_SEPARATOR}${params.threadId}`;
  if (lastThreadRouteRefKey === nextKey && lastThreadRouteRefValue) {
    return lastThreadRouteRefValue;
  }

  lastThreadRouteRefKey = nextKey;
  lastThreadRouteRefValue = scopeThreadRef(
    params.environmentId as EnvironmentId,
    params.threadId as ThreadId,
  );
  return lastThreadRouteRefValue;
}

export function resolveThreadRouteTarget(
  params: Partial<Record<"environmentId" | "threadId" | "draftId", string | undefined>>,
): ThreadRouteTarget | null {
  if (params.environmentId && params.threadId) {
    const nextKey = `server${THREAD_ROUTE_CACHE_SEPARATOR}${params.environmentId}${THREAD_ROUTE_CACHE_SEPARATOR}${params.threadId}`;
    if (lastThreadRouteTargetKey === nextKey && lastThreadRouteTargetValue) {
      return lastThreadRouteTargetValue;
    }

    const threadRef = resolveThreadRouteRef(params);
    if (!threadRef) {
      return null;
    }

    lastThreadRouteTargetKey = nextKey;
    lastThreadRouteTargetValue = {
      kind: "server",
      threadRef,
    };
    return lastThreadRouteTargetValue;
  }

  if (!params.draftId) {
    return null;
  }

  const nextKey = `draft${THREAD_ROUTE_CACHE_SEPARATOR}${params.draftId}`;
  if (lastThreadRouteTargetKey === nextKey && lastThreadRouteTargetValue) {
    return lastThreadRouteTargetValue;
  }

  lastThreadRouteTargetKey = nextKey;
  lastThreadRouteTargetValue = {
    kind: "draft",
    draftId: params.draftId as DraftId,
  };
  return lastThreadRouteTargetValue;
}
