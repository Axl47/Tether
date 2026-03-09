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
        continue;
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
      if (
        !canAutoDispatchQueuedTurn({
          thread,
          isConnecting: false,
          isRevertingCheckpoint: false,
          isLocalSendInFlight: false,
        })
      ) {
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
          setThreadError(thread.id, message);
          console.error("Queued turn dispatch failed", error);
        })
        .finally(() => {
          dispatchingThreadIdsRef.current.delete(thread.id);
          setDispatchingQueuedMessage(thread.id, null);
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
