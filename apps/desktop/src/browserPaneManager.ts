import { randomUUID } from "node:crypto";
import { BrowserWindow, WebContentsView, session as electronSession } from "electron";
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
  emitEvent: (event: BrowserPaneEvent) => void;
  onOpenExternal: (url: string) => Promise<void> | void;
}) {
  const panes = new Map<string, ManagedBrowserPane>();
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
      input.window.contentView.addChildView(pane.view);
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
    const pane: ManagedBrowserPane = {
      paneId,
      view,
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

    view.webContents.setWindowOpenHandler(({ url: nextUrl }) => {
      void input.onOpenExternal(nextUrl);
      return { action: "deny" };
    });
    view.webContents.on("will-navigate", (event, nextUrl) => {
      if (!allowedPaneUrl(nextUrl)) {
        event.preventDefault();
        void input.onOpenExternal(nextUrl);
      }
    });
    view.webContents.on("console-message", (_event, level, message, line, sourceId) => {
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
    view.webContents.on("before-input-event", (event, details) => {
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
    view.webContents.on("focus", () => input.emitEvent({ type: "focus", paneId }));
    view.webContents.on("page-title-updated", (event, title) => {
      event.preventDefault();
      pane.title = title;
      emitSnapshot(pane);
    });
    view.webContents.on("did-start-loading", () => {
      pane.isLoading = true;
      emitSnapshot(pane);
    });
    const syncNavigation = () => {
      pane.isLoading = view.webContents.isLoading();
      pane.url = view.webContents.getURL() || pane.url;
      pane.title = view.webContents.getTitle() || pane.title;
      emitSnapshot(pane);
    };
    view.webContents.on("did-stop-loading", syncNavigation);
    view.webContents.on("did-navigate", syncNavigation);
    view.webContents.on("did-navigate-in-page", syncNavigation);

    paneSession.webRequest.onCompleted((details) => {
      if (details.webContentsId !== view.webContents.id) return;
      const entry: BrowserPaneNetworkEntry = {
        id: randomUUID(),
        paneId,
        timestamp: new Date().toISOString(),
        method: details.method,
        url: details.url,
        status: details.statusCode,
        resourceType: details.resourceType ?? null,
        durationMs: null,
        failureReason: null,
      };
      pushBounded(pane.networkEntries, entry, MAX_NETWORK_ENTRIES);
      input.emitEvent({ type: "network", entry });
    });
    paneSession.webRequest.onErrorOccurred((details) => {
      if (details.webContentsId !== view.webContents.id) return;
      const entry: BrowserPaneNetworkEntry = {
        id: randomUUID(),
        paneId,
        timestamp: new Date().toISOString(),
        method: details.method,
        url: details.url,
        status: null,
        resourceType: details.resourceType ?? null,
        durationMs: null,
        failureReason: details.error,
      };
      pushBounded(pane.networkEntries, entry, MAX_NETWORK_ENTRIES);
      input.emitEvent({ type: "network", entry });
    });

    const safeUrl = allowedPaneUrl(url) ?? "about:blank";
    await view.webContents.loadURL(safeUrl);
    syncNavigation();
  };

  const destroyPane = async ({ paneId }: BrowserPaneCommandInput): Promise<void> => {
    const pane = panes.get(paneId);
    if (!pane) return;
    input.window.contentView.removeChildView(pane.view);
    pane.view.webContents.close({ waitForBeforeUnload: false });
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
      await pane.view.webContents.loadURL("about:blank");
      pane.url = "about:blank";
      emitSnapshot(pane);
      return;
    }
    await pane.view.webContents.loadURL(safeUrl);
  };

  const getSnapshot = ({ paneId }: BrowserPaneCommandInput): BrowserPaneSnapshot => {
    const pane = getPane(paneId);
    return {
      paneId,
      url: pane.view.webContents.getURL() || pane.url,
      title: pane.view.webContents.getTitle() || pane.title,
      canGoBack: pane.view.webContents.navigationHistory.canGoBack(),
      canGoForward: pane.view.webContents.navigationHistory.canGoForward(),
      isLoading: pane.view.webContents.isLoading(),
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
      if (pane.view.webContents.navigationHistory.canGoBack())
        pane.view.webContents.navigationHistory.goBack();
    },
    goForward: async ({ paneId }: BrowserPaneCommandInput) => {
      const pane = getPane(paneId);
      if (pane.view.webContents.navigationHistory.canGoForward())
        pane.view.webContents.navigationHistory.goForward();
    },
    reload: async ({ paneId }: BrowserPaneCommandInput) => {
      getPane(paneId).view.webContents.reload();
    },
    stop: async ({ paneId }: BrowserPaneCommandInput) => {
      getPane(paneId).view.webContents.stop();
    },
    captureScreenshot: async ({
      paneId,
    }: BrowserPaneCommandInput): Promise<BrowserPaneCaptureScreenshotResult> => {
      const image = await getPane(paneId).view.webContents.capturePage();
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
      for (const paneId of panes.keys()) {
        await destroyPane({ paneId });
      }
    },
  };
}
