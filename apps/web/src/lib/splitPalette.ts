import type { ProjectId, ProviderInteractionMode, RuntimeMode, ThreadId } from "@t3tools/contracts";
import type { DraftThreadEnvMode } from "../composerDraftStore";
import type { CommandPaletteMode } from "../commandPaletteStore";
import { findLeafByThreadId, useSplitViewStore } from "../splitViewStore";
import { newThreadId } from "./utils";

type OpenPaletteFn = (options?: {
  mode?: CommandPaletteMode;
  sourceThreadId?: ThreadId | null;
  sourceLeafId?: string | null;
  previewThreadId?: ThreadId | null;
  previewLeafId?: string | null;
}) => void;

type CreateDraftThreadFn = (
  threadId: ThreadId,
  projectId: ProjectId,
  options?: {
    branch?: string | null;
    worktreePath?: string | null;
    createdAt?: string;
    envMode?: DraftThreadEnvMode;
    runtimeMode?: RuntimeMode;
    interactionMode?: ProviderInteractionMode;
  },
) => void;

export function openSplitCommandPaletteWithPreview(input: {
  mode: "split-right" | "split-down";
  activeThreadId: ThreadId | null;
  previewProjectId: ProjectId | null;
  branch: string | null;
  worktreePath: string | null;
  envMode: DraftThreadEnvMode;
  runtimeMode: RuntimeMode;
  interactionMode: ProviderInteractionMode;
  createDraftThread: CreateDraftThreadFn;
  openCommandPalette: OpenPaletteFn;
}): void {
  const {
    activeThreadId,
    branch,
    createDraftThread,
    envMode,
    interactionMode,
    mode,
    openCommandPalette,
    previewProjectId,
    runtimeMode,
    worktreePath,
  } = input;

  if (!activeThreadId) {
    return;
  }

  const splitStore = useSplitViewStore.getState();
  const sourceLeafId = splitStore.group?.focusedLeafId ?? null;

  if (!previewProjectId) {
    openCommandPalette({
      mode,
      sourceThreadId: activeThreadId,
      sourceLeafId,
    });
    return;
  }

  const previewId = newThreadId();
  createDraftThread(previewId, previewProjectId, {
    createdAt: new Date().toISOString(),
    branch,
    worktreePath,
    envMode,
    runtimeMode,
    interactionMode,
  });

  const direction = mode === "split-right" ? "horizontal" : "vertical";
  if (splitStore.group && sourceLeafId) {
    splitStore.splitLeaf(sourceLeafId, previewId, direction, false);
  } else {
    splitStore.splitThread(activeThreadId, previewId, direction, false);
  }

  const previewGroup = useSplitViewStore.getState().group;
  const previewLeafId = previewGroup
    ? (findLeafByThreadId(previewGroup.root, previewId)?.id ?? null)
    : null;

  openCommandPalette({
    mode,
    sourceThreadId: activeThreadId,
    sourceLeafId,
    previewThreadId: previewId,
    previewLeafId,
  });
}

export function openReplaceFocusedCommandPalette(input: {
  activeThreadId: ThreadId | null;
  openCommandPalette: OpenPaletteFn;
}): void {
  const { activeThreadId, openCommandPalette } = input;
  const splitStore = useSplitViewStore.getState();
  if (!splitStore.group) {
    return;
  }

  openCommandPalette({
    mode: "replace-focused",
    sourceThreadId: activeThreadId,
    sourceLeafId: splitStore.group.focusedLeafId,
  });
}
