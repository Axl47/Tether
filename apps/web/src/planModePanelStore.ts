import type { ThreadId, TurnId } from "@t3tools/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface ThreadPlanModePanelState {
  isMinimized: boolean;
  activeTurnId: TurnId | null;
}

interface PlanModePanelStoreState {
  panelStateByThreadId: Record<ThreadId, ThreadPlanModePanelState>;
  setPlanPanelMinimized: (threadId: ThreadId, isMinimized: boolean) => void;
  syncActivePlanTurn: (threadId: ThreadId, activeTurnId: TurnId | null | undefined) => void;
  clearPlanPanelState: (threadId: ThreadId) => void;
  removeOrphanedPlanPanelStates: (activeThreadIds: Set<ThreadId>) => void;
}

const PLAN_MODE_PANEL_STORAGE_KEY = "t3code:plan-mode-panel-state:v1";

const DEFAULT_THREAD_PLAN_MODE_PANEL_STATE: ThreadPlanModePanelState = Object.freeze({
  isMinimized: false,
  activeTurnId: null,
});

function normalizeTurnId(activeTurnId: TurnId | string | null | undefined): TurnId | null {
  if (typeof activeTurnId !== "string") {
    return null;
  }
  const trimmed = activeTurnId.trim();
  return trimmed.length > 0 ? (trimmed as TurnId) : null;
}

function threadPlanModePanelStateEqual(
  left: ThreadPlanModePanelState,
  right: ThreadPlanModePanelState,
): boolean {
  return left.isMinimized === right.isMinimized && left.activeTurnId === right.activeTurnId;
}

function isDefaultThreadPlanModePanelState(state: ThreadPlanModePanelState): boolean {
  return threadPlanModePanelStateEqual(state, DEFAULT_THREAD_PLAN_MODE_PANEL_STATE);
}

export function selectThreadPlanModePanelState(
  panelStateByThreadId: Record<ThreadId, ThreadPlanModePanelState>,
  threadId: ThreadId,
): ThreadPlanModePanelState {
  if (threadId.length === 0) {
    return DEFAULT_THREAD_PLAN_MODE_PANEL_STATE;
  }
  return panelStateByThreadId[threadId] ?? DEFAULT_THREAD_PLAN_MODE_PANEL_STATE;
}

function updatePlanModePanelStateByThreadId(
  panelStateByThreadId: Record<ThreadId, ThreadPlanModePanelState>,
  threadId: ThreadId,
  updater: (state: ThreadPlanModePanelState) => ThreadPlanModePanelState,
): Record<ThreadId, ThreadPlanModePanelState> {
  if (threadId.length === 0) {
    return panelStateByThreadId;
  }

  const current = selectThreadPlanModePanelState(panelStateByThreadId, threadId);
  const next = updater(current);
  if (next === current || threadPlanModePanelStateEqual(next, current)) {
    return panelStateByThreadId;
  }

  if (isDefaultThreadPlanModePanelState(next)) {
    if (panelStateByThreadId[threadId] === undefined) {
      return panelStateByThreadId;
    }
    const { [threadId]: _removed, ...rest } = panelStateByThreadId;
    return rest as Record<ThreadId, ThreadPlanModePanelState>;
  }

  return {
    ...panelStateByThreadId,
    [threadId]: next,
  };
}

function setThreadPlanPanelMinimized(
  state: ThreadPlanModePanelState,
  isMinimized: boolean,
): ThreadPlanModePanelState {
  if (state.isMinimized === isMinimized) {
    return state;
  }
  return {
    ...state,
    isMinimized,
  };
}

function syncThreadActivePlanTurn(
  state: ThreadPlanModePanelState,
  activeTurnId: TurnId | null | undefined,
): ThreadPlanModePanelState {
  const normalizedTurnId = normalizeTurnId(activeTurnId);
  if (normalizedTurnId === null || state.activeTurnId === normalizedTurnId) {
    return state;
  }

  return {
    isMinimized: false,
    activeTurnId: normalizedTurnId,
  };
}

export const usePlanModePanelStore = create<PlanModePanelStoreState>()(
  persist(
    (set) => ({
      panelStateByThreadId: {},
      setPlanPanelMinimized: (threadId, isMinimized) =>
        set((state) => {
          const nextPanelStateByThreadId = updatePlanModePanelStateByThreadId(
            state.panelStateByThreadId,
            threadId,
            (threadState) => setThreadPlanPanelMinimized(threadState, isMinimized),
          );
          if (nextPanelStateByThreadId === state.panelStateByThreadId) {
            return state;
          }
          return { panelStateByThreadId: nextPanelStateByThreadId };
        }),
      syncActivePlanTurn: (threadId, activeTurnId) =>
        set((state) => {
          const nextPanelStateByThreadId = updatePlanModePanelStateByThreadId(
            state.panelStateByThreadId,
            threadId,
            (threadState) => syncThreadActivePlanTurn(threadState, activeTurnId),
          );
          if (nextPanelStateByThreadId === state.panelStateByThreadId) {
            return state;
          }
          return { panelStateByThreadId: nextPanelStateByThreadId };
        }),
      clearPlanPanelState: (threadId) =>
        set((state) => {
          const nextPanelStateByThreadId = updatePlanModePanelStateByThreadId(
            state.panelStateByThreadId,
            threadId,
            () => DEFAULT_THREAD_PLAN_MODE_PANEL_STATE,
          );
          if (nextPanelStateByThreadId === state.panelStateByThreadId) {
            return state;
          }
          return { panelStateByThreadId: nextPanelStateByThreadId };
        }),
      removeOrphanedPlanPanelStates: (activeThreadIds) =>
        set((state) => {
          const orphanedIds = Object.keys(state.panelStateByThreadId).filter(
            (threadId) => !activeThreadIds.has(threadId as ThreadId),
          );
          if (orphanedIds.length === 0) {
            return state;
          }

          const next = { ...state.panelStateByThreadId };
          for (const threadId of orphanedIds) {
            delete next[threadId as ThreadId];
          }
          return { panelStateByThreadId: next };
        }),
    }),
    {
      name: PLAN_MODE_PANEL_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        panelStateByThreadId: state.panelStateByThreadId,
      }),
    },
  ),
);
