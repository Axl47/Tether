import type { BrowserPaneEvent, BrowserPaneSnapshot } from "@t3tools/contracts";
import { create } from "zustand";

interface BrowserPaneRuntimeState {
  snapshotsByPaneId: Record<string, BrowserPaneSnapshot>;
  focusedPaneId: string | null;
  setSnapshot: (snapshot: BrowserPaneSnapshot) => void;
  handleEvent: (event: BrowserPaneEvent) => void;
}

export const useBrowserPaneRuntimeStore = create<BrowserPaneRuntimeState>((set) => ({
  snapshotsByPaneId: {},
  focusedPaneId: null,
  setSnapshot: (snapshot) => set((state) => ({ snapshotsByPaneId: { ...state.snapshotsByPaneId, [snapshot.paneId]: snapshot } })),
  handleEvent: (event) => set((state) => {
    if (event.type === "snapshot") {
      return { snapshotsByPaneId: { ...state.snapshotsByPaneId, [event.snapshot.paneId]: event.snapshot } };
    }
    if (event.type === "focus") {
      return { focusedPaneId: event.paneId };
    }
    if (event.type === "shortcut") {
      window.dispatchEvent(new CustomEvent("tether-browser-shortcut", { detail: event }));
      return {};
    }
    const snapshot = state.snapshotsByPaneId[event.type === "console" ? event.entry.paneId : event.entry.paneId];
    if (!snapshot) return state;
    if (event.type === "console") {
      return { snapshotsByPaneId: { ...state.snapshotsByPaneId, [event.entry.paneId]: { ...snapshot, consoleEntries: [...snapshot.consoleEntries, event.entry].slice(-200) } } };
    }
    return { snapshotsByPaneId: { ...state.snapshotsByPaneId, [event.entry.paneId]: { ...snapshot, networkEntries: [...snapshot.networkEntries, event.entry].slice(-200) } } };
  }),
}));
