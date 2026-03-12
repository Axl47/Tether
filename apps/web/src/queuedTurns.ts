import type { CodexReasoningEffort, NativeApi, ProviderKind, ThreadId } from "@t3tools/contracts";
import { getDefaultReasoningEffort } from "@t3tools/shared/model";

import { type QueuedComposerMessageState } from "./composerDraftStore";
import { derivePendingApprovals, derivePendingUserInputs, derivePhase } from "./session-logic";
import { type Thread } from "./types";
import { newCommandId, newMessageId } from "./lib/utils";

const QUEUED_MESSAGE_PREVIEW_MAX_LENGTH = 96;
const IMAGE_ONLY_QUEUED_PROMPT = "Please inspect the attached image and continue.";

async function readFileAsDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const result = reader.result;
      if (typeof result === "string") {
        resolve(result);
        return;
      }
      reject(new Error("Failed to read attachment."));
    });
    reader.addEventListener("error", () => {
      reject(reader.error ?? new Error("Failed to read attachment."));
    });
    reader.readAsDataURL(file);
  });
}

function truncateQueuedPreview(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= QUEUED_MESSAGE_PREVIEW_MAX_LENGTH) {
    return trimmed;
  }
  return `${trimmed.slice(0, QUEUED_MESSAGE_PREVIEW_MAX_LENGTH - 1).trimEnd()}…`;
}

function resolveQueuedProvider(thread: Thread, snapshot: QueuedComposerMessageState): ProviderKind {
  return snapshot.provider ?? thread.session?.provider ?? "codex";
}

function queuedModelOptions(snapshot: QueuedComposerMessageState):
  | {
      codex: { reasoningEffort?: CodexReasoningEffort; fastMode?: true };
    }
  | undefined {
  if (snapshot.provider !== "codex") {
    return undefined;
  }
  const codexOptions: {
    reasoningEffort?: CodexReasoningEffort;
    fastMode?: true;
  } = {};
  const defaultEffort = getDefaultReasoningEffort("codex");
  if (snapshot.effort && snapshot.effort !== defaultEffort) {
    codexOptions.reasoningEffort = snapshot.effort;
  }
  if (snapshot.codexFastMode) {
    codexOptions.fastMode = true;
  }
  return Object.keys(codexOptions).length > 0 ? { codex: codexOptions } : undefined;
}

function queuedProviderOptions(input: {
  provider: ProviderKind;
  codexBinaryPath: string;
  codexHomePath: string;
}) {
  if (input.provider !== "codex") {
    return undefined;
  }
  if (!input.codexBinaryPath && !input.codexHomePath) {
    return undefined;
  }
  return {
    codex: {
      ...(input.codexBinaryPath ? { binaryPath: input.codexBinaryPath } : {}),
      ...(input.codexHomePath ? { homePath: input.codexHomePath } : {}),
    },
  };
}

async function persistQueuedThreadSettings(input: {
  api: NativeApi;
  thread: Thread;
  snapshot: QueuedComposerMessageState;
  createdAt: string;
}): Promise<void> {
  const nextModel = input.snapshot.model ?? undefined;
  const nextRuntimeMode = input.snapshot.runtimeMode ?? input.thread.runtimeMode;
  const nextInteractionMode = input.snapshot.interactionMode ?? input.thread.interactionMode;

  if (nextModel !== undefined && nextModel !== input.thread.model) {
    await input.api.orchestration.dispatchCommand({
      type: "thread.meta.update",
      commandId: newCommandId(),
      threadId: input.thread.id,
      model: nextModel,
    });
  }

  if (nextRuntimeMode !== input.thread.runtimeMode) {
    await input.api.orchestration.dispatchCommand({
      type: "thread.runtime-mode.set",
      commandId: newCommandId(),
      threadId: input.thread.id,
      runtimeMode: nextRuntimeMode,
      createdAt: input.createdAt,
    });
  }

  if (nextInteractionMode !== input.thread.interactionMode) {
    await input.api.orchestration.dispatchCommand({
      type: "thread.interaction-mode.set",
      commandId: newCommandId(),
      threadId: input.thread.id,
      interactionMode: nextInteractionMode,
      createdAt: input.createdAt,
    });
  }
}

export function queuedMessagePreview(snapshot: {
  prompt: string;
  persistedAttachments: ReadonlyArray<{ name: string }>;
}): string {
  const trimmedPrompt = snapshot.prompt.trim();
  if (trimmedPrompt.length > 0) {
    return truncateQueuedPreview(trimmedPrompt);
  }
  const firstAttachment = snapshot.persistedAttachments[0];
  if (firstAttachment) {
    return truncateQueuedPreview(`Image: ${firstAttachment.name}`);
  }
  return "Queued follow-up";
}

export function canAutoDispatchQueuedTurn(input: {
  thread: Thread | null;
  isConnecting: boolean;
  isRevertingCheckpoint: boolean;
  isLocalSendInFlight: boolean;
}): boolean {
  const { thread } = input;
  if (!thread) {
    return false;
  }
  if (input.isConnecting || input.isRevertingCheckpoint || input.isLocalSendInFlight) {
    return false;
  }
  if (derivePhase(thread.session) === "running") {
    return false;
  }
  if (derivePendingApprovals(thread.activities).length > 0) {
    return false;
  }
  if (derivePendingUserInputs(thread.activities).length > 0) {
    return false;
  }
  return true;
}

export async function dispatchQueuedTurn(input: {
  api: NativeApi;
  thread: Thread;
  snapshot: QueuedComposerMessageState;
  settings: {
    enableAssistantStreaming: boolean;
    codexBinaryPath: string;
    codexHomePath: string;
  };
  setThreadError: (threadId: ThreadId, error: string | null) => void;
}): Promise<void> {
  const messageCreatedAt = new Date().toISOString();
  const provider = resolveQueuedProvider(input.thread, input.snapshot);
  const runtimeMode = input.snapshot.runtimeMode ?? input.thread.runtimeMode;
  const interactionMode = input.snapshot.interactionMode ?? input.thread.interactionMode;
  const turnAttachments = await Promise.all(
    input.snapshot.images.map(async (image) => ({
      type: "image" as const,
      name: image.name,
      mimeType: image.mimeType,
      sizeBytes: image.sizeBytes,
      dataUrl: await readFileAsDataUrl(image.file),
    })),
  );
  const modelOptions = queuedModelOptions({
    ...input.snapshot,
    provider,
  });
  const providerOptions = queuedProviderOptions({
    provider,
    codexBinaryPath: input.settings.codexBinaryPath,
    codexHomePath: input.settings.codexHomePath,
  });

  input.setThreadError(input.thread.id, null);
  await persistQueuedThreadSettings({
    api: input.api,
    thread: input.thread,
    snapshot: {
      ...input.snapshot,
      provider,
      runtimeMode,
      interactionMode,
    },
    createdAt: messageCreatedAt,
  });

  await input.api.orchestration.dispatchCommand({
    type: "thread.turn.start",
    commandId: newCommandId(),
    threadId: input.thread.id,
    message: {
      messageId: newMessageId(),
      role: "user",
      text: input.snapshot.prompt.trim() || IMAGE_ONLY_QUEUED_PROMPT,
      attachments: turnAttachments,
    },
    provider,
    model: input.snapshot.model ?? undefined,
    ...(modelOptions ? { modelOptions } : {}),
    ...(providerOptions ? { providerOptions } : {}),
    assistantDeliveryMode: input.settings.enableAssistantStreaming ? "streaming" : "buffered",
    runtimeMode,
    interactionMode,
    createdAt: messageCreatedAt,
  });
}
