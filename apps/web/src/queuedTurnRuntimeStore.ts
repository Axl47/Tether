import { ThreadId } from "@t3tools/contracts";
import { create } from "zustand";

interface QueuedTurnRuntimeStoreState {
  dispatchingQueuedMessageIdByThreadId: Record<ThreadId, string>;
  setDispatchingQueuedMessage: (threadId: ThreadId, queuedMessageId: string | null) => void;
}

export const useQueuedTurnRuntimeStore = create<QueuedTurnRuntimeStoreState>()((set) => ({
  dispatchingQueuedMessageIdByThreadId: {},
  setDispatchingQueuedMessage: (threadId, queuedMessageId) => {
    if (threadId.length === 0) {
      return;
    }
    set((state) => {
      const next = { ...state.dispatchingQueuedMessageIdByThreadId };
      if (!queuedMessageId) {
        if (!(threadId in next)) {
          return state;
        }
        delete next[threadId];
        return { dispatchingQueuedMessageIdByThreadId: next };
      }
      if (next[threadId] === queuedMessageId) {
        return state;
      }
      next[threadId] = queuedMessageId;
      return { dispatchingQueuedMessageIdByThreadId: next };
    });
  },
}));
