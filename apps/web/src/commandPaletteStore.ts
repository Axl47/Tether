import type { ThreadId } from "@t3tools/contracts";
import { create } from "zustand";

export type CommandPaletteMode = "default" | "split-right" | "split-down" | "replace-focused";

interface CommandPaletteOpenIntent {
  kind: "add-project";
  requestId: number;
}

interface CommandPaletteState {
  open: boolean;
  mode: CommandPaletteMode;
  sourceThreadId: ThreadId | null;
  sourceLeafId: string | null;
  previewThreadId: ThreadId | null;
  previewLeafId: string | null;
  openIntent: CommandPaletteOpenIntent | null;
}

interface CommandPaletteStore extends CommandPaletteState {
  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
  openPalette: (options?: {
    mode?: CommandPaletteMode;
    sourceThreadId?: ThreadId | null;
    sourceLeafId?: string | null;
    previewThreadId?: ThreadId | null;
    previewLeafId?: string | null;
  }) => void;
  closePalette: () => void;
  toggleDefaultPalette: () => void;
  openAddProject: () => void;
  clearOpenIntent: () => void;
}

const DEFAULT_STATE: CommandPaletteState = {
  open: false,
  mode: "default",
  sourceThreadId: null,
  sourceLeafId: null,
  previewThreadId: null,
  previewLeafId: null,
  openIntent: null,
};

function isDefaultCommandPaletteState(state: CommandPaletteState): boolean {
  return (
    !state.open &&
    state.mode === DEFAULT_STATE.mode &&
    state.sourceThreadId === DEFAULT_STATE.sourceThreadId &&
    state.sourceLeafId === DEFAULT_STATE.sourceLeafId &&
    state.previewThreadId === DEFAULT_STATE.previewThreadId &&
    state.previewLeafId === DEFAULT_STATE.previewLeafId &&
    state.openIntent === DEFAULT_STATE.openIntent
  );
}

function isSameCommandPaletteState(left: CommandPaletteState, right: CommandPaletteState): boolean {
  return (
    left.open === right.open &&
    left.mode === right.mode &&
    left.sourceThreadId === right.sourceThreadId &&
    left.sourceLeafId === right.sourceLeafId &&
    left.previewThreadId === right.previewThreadId &&
    left.previewLeafId === right.previewLeafId &&
    left.openIntent?.kind === right.openIntent?.kind &&
    left.openIntent?.requestId === right.openIntent?.requestId
  );
}

export const useCommandPaletteStore = create<CommandPaletteStore>((set, get) => ({
  ...DEFAULT_STATE,
  setOpen: (open) => {
    if (!open) {
      set((state) => (isDefaultCommandPaletteState(state) ? state : DEFAULT_STATE));
      return;
    }
    const nextState = {
      ...DEFAULT_STATE,
      open: true,
    } satisfies CommandPaletteState;
    set((state) => (isSameCommandPaletteState(state, nextState) ? state : nextState));
  },

  toggleOpen: () => {
    const state = get();
    if (state.open) {
      set((current) => (isDefaultCommandPaletteState(current) ? current : DEFAULT_STATE));
      return;
    }
    const nextState = {
      ...DEFAULT_STATE,
      open: true,
    } satisfies CommandPaletteState;
    set((current) => (isSameCommandPaletteState(current, nextState) ? current : nextState));
  },

  openPalette: (options) => {
    const nextState = {
      open: true,
      mode: options?.mode ?? "default",
      sourceThreadId: options?.sourceThreadId ?? null,
      sourceLeafId: options?.sourceLeafId ?? null,
      previewThreadId: options?.previewThreadId ?? null,
      previewLeafId: options?.previewLeafId ?? null,
      openIntent: null,
    } satisfies CommandPaletteState;
    set((state) => (isSameCommandPaletteState(state, nextState) ? state : nextState));
  },

  closePalette: () => {
    const state = get();
    if (!state.open && state.mode === DEFAULT_STATE.mode) {
      return;
    }
    set((current) => (isDefaultCommandPaletteState(current) ? current : DEFAULT_STATE));
  },

  toggleDefaultPalette: () => {
    const state = get();
    if (state.open && state.mode === "default") {
      set((current) => (isDefaultCommandPaletteState(current) ? current : DEFAULT_STATE));
      return;
    }
    const nextState = {
      open: true,
      mode: "default",
      sourceThreadId: null,
      sourceLeafId: null,
      previewThreadId: null,
      previewLeafId: null,
      openIntent: null,
    } satisfies CommandPaletteState;
    set((current) => (isSameCommandPaletteState(current, nextState) ? current : nextState));
  },

  openAddProject: () =>
    set((state) => ({
      ...DEFAULT_STATE,
      open: true,
      openIntent: {
        kind: "add-project",
        requestId: (state.openIntent?.requestId ?? 0) + 1,
      },
    })),

  clearOpenIntent: () => set((state) => (state.openIntent === null ? state : { openIntent: null })),
}));
