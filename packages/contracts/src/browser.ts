import type { ThreadId } from "./baseSchemas";
import type { KeybindingCommand, ResolvedKeybindingsConfig } from "./keybindings";

export interface BrowserPaneBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface BrowserPanePersistedState {
  paneId: string;
  url: string;
  targetThreadId: ThreadId;
  createdFromThreadId: ThreadId;
}

export interface BrowserPaneEnsureInput extends BrowserPanePersistedState {}

export interface BrowserPaneSetBoundsInput {
  paneId: string;
  bounds: BrowserPaneBounds;
}

export interface BrowserPaneSetVisibleInput {
  paneId: string;
  visible: boolean;
}

export interface BrowserPaneNavigateInput {
  paneId: string;
  url: string;
}

export interface BrowserPaneCommandInput {
  paneId: string;
}

export interface BrowserPaneCaptureScreenshotResult {
  paneId: string;
  dataUrl: string;
  sizeBytes: number;
  capturedAt: string;
}

export interface BrowserPaneConsoleEntry {
  id: string;
  paneId: string;
  timestamp: string;
  level: "log" | "warning" | "error" | "info" | "debug";
  message: string;
  sourceId?: string;
  line?: number;
}

export interface BrowserPaneNetworkEntry {
  id: string;
  paneId: string;
  timestamp: string;
  method: string;
  url: string;
  status: number | null;
  resourceType: string | null;
  durationMs: number | null;
  failureReason: string | null;
}

export interface BrowserPaneSnapshot {
  paneId: string;
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
  visible: boolean;
  consoleEntries: BrowserPaneConsoleEntry[];
  networkEntries: BrowserPaneNetworkEntry[];
}

export interface BrowserPaneShortcutState {
  keybindings: ResolvedKeybindingsConfig;
  terminalOpen: boolean;
  platform: string;
}

export type BrowserPaneEvent =
  | { type: "snapshot"; snapshot: BrowserPaneSnapshot }
  | { type: "console"; entry: BrowserPaneConsoleEntry }
  | { type: "network"; entry: BrowserPaneNetworkEntry }
  | { type: "focus"; paneId: string }
  | { type: "shortcut"; paneId: string; command: KeybindingCommand };
