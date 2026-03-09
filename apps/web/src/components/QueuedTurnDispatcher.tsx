import { useEffect, useRef } from "react";

import { useAppSettings } from "../appSettings";
import { useComposerDraftStore } from "../composerDraftStore";
import { readNativeApi } from "../nativeApi";
import { useQueuedTurnRuntimeStore } from "../queuedTurnRuntimeStore";
import { useStore } from "../store";
import { canAutoDispatchQueuedTurn, dispatchQueuedTurn } from "../queuedTurns";

export function QueuedTurnDispatcher() {
  const { settings } = useAppSettings();
  const threads = useStore((store) => store.threads);
  const setThreadError = useStore((store) => store.setError);
  const queuedMessagesByThreadId = useComposerDraftStore(
    (store) => store.queuedMessagesByThreadId,
  );
  const setDispatchingQueuedMessage = useQueuedTurnRuntimeStore(
    (store) => store.setDispatchingQueuedMessage,
  );
  const dispatchingThreadIdsRef = useRef(new Set<string>());
  const failedDispatchSignatureByThreadIdRef = useRef(new Map<string, string>());
  const queuedTurnCycleStateByThreadIdRef = useRef(
    new Map<string, "awaiting-busy" | "awaiting-idle">(),
  );

  useEffect(() => {
    const api = readNativeApi();
    if (!api) {
      return;
    }

    for (const thread of threads) {
      const queue = queuedMessagesByThreadId[thread.id];
      const queueHead = queue?.[0];
      if (!queueHead) {
        failedDispatchSignatureByThreadIdRef.current.delete(thread.id);
        queuedTurnCycleStateByThreadIdRef.current.delete(thread.id);
        setDispatchingQueuedMessage(thread.id, null);
        continue;
      }

      const canDispatch = canAutoDispatchQueuedTurn({
        thread,
        isConnecting: false,
        isRevertingCheckpoint: false,
        isLocalSendInFlight: false,
      });
      const cycleState =
        queuedTurnCycleStateByThreadIdRef.current.get(thread.id) ?? null;
      if (cycleState === "awaiting-busy") {
        if (!canDispatch) {
          queuedTurnCycleStateByThreadIdRef.current.set(
            thread.id,
            "awaiting-idle",
          );
          setDispatchingQueuedMessage(thread.id, null);
        }
        continue;
      }
      if (cycleState === "awaiting-idle") {
        if (!canDispatch) {
          continue;
        }
        queuedTurnCycleStateByThreadIdRef.current.delete(thread.id);
      }

      const failureSignature = `${queueHead.id}:${thread.updatedAt}:${
        thread.session?.updatedAt ?? ""
      }`;
      const previousFailureSignature =
        failedDispatchSignatureByThreadIdRef.current.get(thread.id) ?? null;
      if (
        previousFailureSignature !== null &&
        previousFailureSignature !== failureSignature
      ) {
        failedDispatchSignatureByThreadIdRef.current.delete(thread.id);
      }

      if (dispatchingThreadIdsRef.current.has(thread.id)) {
        continue;
      }
      if (
        failedDispatchSignatureByThreadIdRef.current.get(thread.id) ===
        failureSignature
      ) {
        continue;
      }
      if (!canDispatch) {
        continue;
      }

      dispatchingThreadIdsRef.current.add(thread.id);
      setDispatchingQueuedMessage(thread.id, queueHead.id);
      void dispatchQueuedTurn({
        api,
        thread,
        snapshot: queueHead,
        settings: {
          enableAssistantStreaming: settings.enableAssistantStreaming,
          codexServiceTier: settings.codexServiceTier,
        },
        setThreadError,
      })
        .then(() => {
          useComposerDraftStore
            .getState()
            .consumeQueuedMessage(thread.id, queueHead.id);
          failedDispatchSignatureByThreadIdRef.current.delete(thread.id);
          queuedTurnCycleStateByThreadIdRef.current.set(
            thread.id,
            "awaiting-busy",
          );
        })
        .catch((error: unknown) => {
          const message =
            error instanceof Error
              ? error.message
              : "Failed to send queued follow-up.";
          failedDispatchSignatureByThreadIdRef.current.set(
            thread.id,
            failureSignature,
          );
          queuedTurnCycleStateByThreadIdRef.current.delete(thread.id);
          setDispatchingQueuedMessage(thread.id, null);
          setThreadError(thread.id, message);
          console.error("Queued turn dispatch failed", error);
        })
        .finally(() => {
          dispatchingThreadIdsRef.current.delete(thread.id);
        });
    }
  }, [
    queuedMessagesByThreadId,
    setDispatchingQueuedMessage,
    setThreadError,
    settings.codexServiceTier,
    settings.enableAssistantStreaming,
    threads,
  ]);

  return null;
}
