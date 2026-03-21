import { randomUUID } from "node:crypto";
import {
  BrowserWindow,
  WebContentsView,
  session as electronSession,
  type View,
  type WebContents,
} from "electron";
import type {
  BrowserPaneBounds,
  BrowserPaneCaptureScreenshotResult,
  BrowserPaneCommandInput,
  BrowserPaneConsoleEntry,
  BrowserPaneEnsureInput,
  BrowserPaneEvent,
  BrowserPaneNetworkEntry,
  BrowserPaneSetBoundsInput,
  BrowserPaneSetVisibleInput,
  BrowserPaneShortcutState,
  BrowserPaneSnapshot,
  BrowserPaneNavigateInput,
} from "@t3tools/contracts";
import { resolveShortcutCommand } from "@t3tools/shared/keybindings";

const MAX_CONSOLE_ENTRIES = 200;
const MAX_NETWORK_ENTRIES = 200;

interface ManagedBrowserPane {
  paneId: string;
  view: WebContentsView;
  webContents: WebContents;
  visible: boolean;
  bounds: BrowserPaneBounds;
  url: string;
  title: string;
  isLoading: boolean;
  consoleEntries: BrowserPaneConsoleEntry[];
  networkEntries: BrowserPaneNetworkEntry[];
}

function allowedPaneUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.toString();
  } catch {
    if (rawUrl === "about:blank") return rawUrl;
  }
  return rawUrl === "about:blank" ? rawUrl : null;
}

function pushBounded<T>(items: T[], item: T, limit: number): void {
  items.push(item);
  if (items.length > limit) items.splice(0, items.length - limit);
}

function requestKey(webContentsId: number, requestId: number): string {
  return `${webContentsId}:${requestId}`;
}

function setPaneBoundsInternal(pane: ManagedBrowserPane, bounds: BrowserPaneBounds): void {
  pane.bounds = bounds;
  pane.view.setBounds({
    x: Math.round(bounds.left),
    y: Math.round(bounds.top),
    width: Math.max(0, Math.round(bounds.width)),
    height: Math.max(0, Math.round(bounds.height)),
  });
}

export function createBrowserPaneManager(input: {
  window: BrowserWindow;
  parentView: View;
  emitEvent: (event: BrowserPaneEvent) => void;
  onOpenExternal: (url: string) => Promise<void> | void;
}) {
  const panes = new Map<string, ManagedBrowserPane>();
  const requestStartedAtByKey = new Map<string, number>();
  let shortcutState: BrowserPaneShortcutState = {
    keybindings: [],
    terminalOpen: false,
    platform: process.platform,
  };

  const emitSnapshot = (pane: ManagedBrowserPane): void => {
    input.emitEvent({ type: "snapshot", snapshot: getSnapshot({ paneId: pane.paneId }) });
  };

  const ensureViewAttached = (pane: ManagedBrowserPane) => {
    try {
      input.parentView.addChildView(pane.view);
    } catch {
      // Already attached.
    }
  };

  const getPane = (paneId: string): ManagedBrowserPane => {
    const pane = panes.get(paneId);
    if (!pane) throw new Error(`Unknown browser pane: ${paneId}`);
    return pane;
  };

  const ensurePane = async ({ paneId, url }: BrowserPaneEnsureInput): Promise<void> => {
    const existing = panes.get(paneId);
    if (existing) {
      existing.url = url;
      emitSnapshot(existing);
      return;
    }
    const partition = `tether-browser-pane-${paneId}`;
    const paneSession = electronSession.fromPartition(partition, { cache: false });
    const view = new WebContentsView({
      webPreferences: {
        sandbox: true,
        nodeIntegration: false,
        session: paneSession,
        webviewTag: false,
        contextIsolation: true,
      },
    });
    const paneWebContents = view.webContents;
    const pane: ManagedBrowserPane = {
      paneId,
      view,
      webContents: paneWebContents,
      visible: false,
      bounds: { left: 0, top: 0, width: 0, height: 0 },
      url,
      title: "",
      isLoading: false,
      consoleEntries: [],
      networkEntries: [],
    };
    panes.set(paneId, pane);
    ensureViewAttached(pane);
    view.setVisible(false);
    setPaneBoundsInternal(pane, pane.bounds);

    paneWebContents.setWindowOpenHandler(({ url: nextUrl }) => {
      void input.onOpenExternal(nextUrl);
      return { action: "deny" };
    });
    paneWebContents.on("will-navigate", (event, nextUrl) => {
      if (!allowedPaneUrl(nextUrl)) {
        event.preventDefault();
        void input.onOpenExternal(nextUrl);
      }
    });
    paneWebContents.on("console-message", (_event, level, message, line, sourceId) => {
      const entry: BrowserPaneConsoleEntry = {
        id: randomUUID(),
        paneId,
        timestamp: new Date().toISOString(),
        level: level >= 3 ? "error" : level === 2 ? "warning" : level === 1 ? "info" : "log",
        message,
        line,
        sourceId,
      };
      pushBounded(pane.consoleEntries, entry, MAX_CONSOLE_ENTRIES);
      input.emitEvent({ type: "console", entry });
    });
    paneWebContents.on("before-input-event", (event, details) => {
      const command = resolveShortcutCommand(
        {
          type: details.type,
          key: details.key,
          metaKey: details.meta,
          ctrlKey: details.control,
          shiftKey: details.shift,
          altKey: details.alt,
        },
        shortcutState.keybindings,
        {
          context: { terminalFocus: false, terminalOpen: shortcutState.terminalOpen },
          platform: shortcutState.platform,
        },
      );
      if (!command) return;
      if (
        ![
          "commandPalette.toggle",
          "diff.toggle",
          "chat.splitRight",
          "chat.splitDown",
          "chat.new",
          "chat.newLocal",
          "editor.openFavorite",
        ].includes(command)
      )
        return;
      event.preventDefault();
      input.emitEvent({ type: "shortcut", paneId, command: command as never });
    });
    paneWebContents.on("focus", () => input.emitEvent({ type: "focus", paneId }));
    paneWebContents.on("page-title-updated", (event, title) => {
      event.preventDefault();
      pane.title = title;
      emitSnapshot(pane);
    });
    paneWebContents.on("did-start-loading", () => {
      pane.isLoading = true;
      emitSnapshot(pane);
    });
    const syncNavigation = () => {
      if (pane.webContents.isDestroyed()) {
        pane.isLoading = false;
        emitSnapshot(pane);
        return;
      }
      pane.isLoading = pane.webContents.isLoading();
      pane.url = pane.webContents.getURL() || pane.url;
      pane.title = pane.webContents.getTitle() || pane.title;
      emitSnapshot(pane);
    };
    paneWebContents.on("did-stop-loading", syncNavigation);
    paneWebContents.on("did-navigate", syncNavigation);
    paneWebContents.on("did-navigate-in-page", syncNavigation);

    paneSession.webRequest.onBeforeRequest((details, callback) => {
      requestStartedAtByKey.set(requestKey(paneWebContents.id, details.id), details.timestamp);
      callback({});
    });
    paneSession.webRequest.onCompleted((details) => {
      if (details.webContentsId !== paneWebContents.id) return;
      const key = requestKey(paneWebContents.id, details.id);
      const startedAt = requestStartedAtByKey.get(key) ?? null;
      requestStartedAtByKey.delete(key);
      const entry: BrowserPaneNetworkEntry = {
        id: randomUUID(),
        paneId,
        timestamp: new Date().toISOString(),
        method: details.method,
        url: details.url,
        status: details.statusCode,
        resourceType: details.resourceType ?? null,
        durationMs: startedAt === null ? null : Math.max(0, details.timestamp - startedAt),
        failureReason: null,
      };
      pushBounded(pane.networkEntries, entry, MAX_NETWORK_ENTRIES);
      input.emitEvent({ type: "network", entry });
    });
    paneSession.webRequest.onErrorOccurred((details) => {
      if (details.webContentsId !== paneWebContents.id) return;
      const key = requestKey(paneWebContents.id, details.id);
      const startedAt = requestStartedAtByKey.get(key) ?? null;
      requestStartedAtByKey.delete(key);
      const entry: BrowserPaneNetworkEntry = {
        id: randomUUID(),
        paneId,
        timestamp: new Date().toISOString(),
        method: details.method,
        url: details.url,
        status: null,
        resourceType: details.resourceType ?? null,
        durationMs: startedAt === null ? null : Math.max(0, details.timestamp - startedAt),
        failureReason: details.error,
      };
      pushBounded(pane.networkEntries, entry, MAX_NETWORK_ENTRIES);
      input.emitEvent({ type: "network", entry });
    });

    const safeUrl = allowedPaneUrl(url) ?? "about:blank";
    try {
      await paneWebContents.loadURL(safeUrl);
    } catch {
      pane.url = safeUrl;
      pane.isLoading = false;
    }
    syncNavigation();
  };

  const destroyPane = async ({ paneId }: BrowserPaneCommandInput): Promise<void> => {
    const pane = panes.get(paneId);
    if (!pane) return;
    try {
      input.parentView.removeChildView(pane.view);
    } catch {
      // Parent view may already be tearing down.
    }
    const keyPrefix = `${pane.webContents.id}:`;
    for (const key of requestStartedAtByKey.keys()) {
      if (key.startsWith(keyPrefix)) {
        requestStartedAtByKey.delete(key);
      }
    }
    if (!pane.webContents.isDestroyed()) {
      pane.webContents.close({ waitForBeforeUnload: false });
    }
    panes.delete(paneId);
  };

  const navigate = async ({ paneId, url }: BrowserPaneNavigateInput): Promise<void> => {
    const pane = getPane(paneId);
    const safeUrl = allowedPaneUrl(url);
    if (!safeUrl) {
      await input.onOpenExternal(url);
      return;
    }
    if (safeUrl === "about:blank") {
      try {
        await pane.webContents.loadURL("about:blank");
      } catch {
        pane.url = "about:blank";
        pane.isLoading = false;
      }
      emitSnapshot(pane);
      return;
    }
    try {
      await pane.webContents.loadURL(safeUrl);
    } catch {
      pane.url = safeUrl;
      pane.isLoading = false;
      emitSnapshot(pane);
    }
  };

  const getSnapshot = ({ paneId }: BrowserPaneCommandInput): BrowserPaneSnapshot => {
    const pane = getPane(paneId);
    if (pane.webContents.isDestroyed()) {
      return {
        paneId,
        url: pane.url,
        title: pane.title,
        canGoBack: false,
        canGoForward: false,
        isLoading: false,
        visible: pane.visible,
        consoleEntries: [...pane.consoleEntries],
        networkEntries: [...pane.networkEntries],
      };
    }
    return {
      paneId,
      url: pane.webContents.getURL() || pane.url,
      title: pane.webContents.getTitle() || pane.title,
      canGoBack: pane.webContents.navigationHistory.canGoBack(),
      canGoForward: pane.webContents.navigationHistory.canGoForward(),
      isLoading: pane.webContents.isLoading(),
      visible: pane.visible,
      consoleEntries: [...pane.consoleEntries],
      networkEntries: [...pane.networkEntries],
    };
  };

  return {
    ensurePane,
    destroyPane,
    setBounds: async ({ paneId, bounds }: BrowserPaneSetBoundsInput) => {
      const pane = getPane(paneId);
      setPaneBoundsInternal(pane, bounds);
    },
    setVisible: async ({ paneId, visible }: BrowserPaneSetVisibleInput) => {
      const pane = getPane(paneId);
      pane.visible = visible;
      ensureViewAttached(pane);
      pane.view.setVisible(visible);
      emitSnapshot(pane);
    },
    navigate,
    goBack: async ({ paneId }: BrowserPaneCommandInput) => {
      const pane = getPane(paneId);
      if (!pane.webContents.isDestroyed() && pane.webContents.navigationHistory.canGoBack())
        pane.webContents.navigationHistory.goBack();
    },
    goForward: async ({ paneId }: BrowserPaneCommandInput) => {
      const pane = getPane(paneId);
      if (!pane.webContents.isDestroyed() && pane.webContents.navigationHistory.canGoForward())
        pane.webContents.navigationHistory.goForward();
    },
    reload: async ({ paneId }: BrowserPaneCommandInput) => {
      const pane = getPane(paneId);
      if (!pane.webContents.isDestroyed()) pane.webContents.reload();
    },
    stop: async ({ paneId }: BrowserPaneCommandInput) => {
      const pane = getPane(paneId);
      if (!pane.webContents.isDestroyed()) pane.webContents.stop();
    },
    captureScreenshot: async ({
      paneId,
    }: BrowserPaneCommandInput): Promise<BrowserPaneCaptureScreenshotResult> => {
      const pane = getPane(paneId);
      if (pane.webContents.isDestroyed()) {
        throw new Error(`Browser pane is not available: ${paneId}`);
      }
      const image = await pane.webContents.capturePage();
      const png = image.toPNG();
      return {
        paneId,
        dataUrl: `data:image/png;base64,${png.toString("base64")}`,
        sizeBytes: png.byteLength,
        capturedAt: new Date().toISOString(),
      };
    },
    getSnapshot: async (input: BrowserPaneCommandInput) => getSnapshot(input),
    syncShortcutState: async (state: BrowserPaneShortcutState) => {
      shortcutState = state;
    },
    hideAll: async () => {
      for (const pane of panes.values()) {
        pane.visible = false;
        pane.view.setVisible(false);
      }
    },
    destroyAll: async () => {
      while (panes.size > 0) {
        const paneId = panes.keys().next().value;
        if (!paneId) break;
        await destroyPane({ paneId });
      }
      requestStartedAtByKey.clear();
    },
  };
}
