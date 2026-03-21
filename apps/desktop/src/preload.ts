import { contextBridge, ipcRenderer } from "electron";
import type { DesktopBridge } from "@t3tools/contracts";

const PICK_FOLDER_CHANNEL = "desktop:pick-folder";
const CONFIRM_CHANNEL = "desktop:confirm";
const SET_THEME_CHANNEL = "desktop:set-theme";
const CONTEXT_MENU_CHANNEL = "desktop:context-menu";
const OPEN_EXTERNAL_CHANNEL = "desktop:open-external";
const MENU_ACTION_CHANNEL = "desktop:menu-action";
const UPDATE_STATE_CHANNEL = "desktop:update-state";
const UPDATE_GET_STATE_CHANNEL = "desktop:update-get-state";
const UPDATE_DOWNLOAD_CHANNEL = "desktop:update-download";
const UPDATE_INSTALL_CHANNEL = "desktop:update-install";
const BROWSER_ENSURE_CHANNEL = "desktop:browser-ensure";
const BROWSER_DESTROY_CHANNEL = "desktop:browser-destroy";
const BROWSER_SET_BOUNDS_CHANNEL = "desktop:browser-set-bounds";
const BROWSER_SET_VISIBLE_CHANNEL = "desktop:browser-set-visible";
const BROWSER_NAVIGATE_CHANNEL = "desktop:browser-navigate";
const BROWSER_GO_BACK_CHANNEL = "desktop:browser-go-back";
const BROWSER_GO_FORWARD_CHANNEL = "desktop:browser-go-forward";
const BROWSER_RELOAD_CHANNEL = "desktop:browser-reload";
const BROWSER_STOP_CHANNEL = "desktop:browser-stop";
const BROWSER_CAPTURE_SCREENSHOT_CHANNEL = "desktop:browser-capture-screenshot";
const BROWSER_GET_SNAPSHOT_CHANNEL = "desktop:browser-get-snapshot";
const BROWSER_EVENT_CHANNEL = "desktop:browser-event";
const BROWSER_SYNC_SHORTCUTS_CHANNEL = "desktop:browser-sync-shortcuts";
const wsUrl = process.env.TETHER_DESKTOP_WS_URL ?? null;

contextBridge.exposeInMainWorld("desktopBridge", {
  browser: {
    ensurePane: (input) => ipcRenderer.invoke(BROWSER_ENSURE_CHANNEL, input),
    destroyPane: (input) => ipcRenderer.invoke(BROWSER_DESTROY_CHANNEL, input),
    setBounds: (input) => ipcRenderer.invoke(BROWSER_SET_BOUNDS_CHANNEL, input),
    setVisible: (input) => ipcRenderer.invoke(BROWSER_SET_VISIBLE_CHANNEL, input),
    navigate: (input) => ipcRenderer.invoke(BROWSER_NAVIGATE_CHANNEL, input),
    goBack: (input) => ipcRenderer.invoke(BROWSER_GO_BACK_CHANNEL, input),
    goForward: (input) => ipcRenderer.invoke(BROWSER_GO_FORWARD_CHANNEL, input),
    reload: (input) => ipcRenderer.invoke(BROWSER_RELOAD_CHANNEL, input),
    stop: (input) => ipcRenderer.invoke(BROWSER_STOP_CHANNEL, input),
    captureScreenshot: (input) => ipcRenderer.invoke(BROWSER_CAPTURE_SCREENSHOT_CHANNEL, input),
    getSnapshot: (input) => ipcRenderer.invoke(BROWSER_GET_SNAPSHOT_CHANNEL, input),
    syncShortcutState: (state) => ipcRenderer.invoke(BROWSER_SYNC_SHORTCUTS_CHANNEL, state),
    onEvent: (listener) => {
      const wrappedListener = (_event: Electron.IpcRendererEvent, payload: unknown) => {
        if (typeof payload !== "object" || payload === null) return;
        listener(payload as Parameters<typeof listener>[0]);
      };
      ipcRenderer.on(BROWSER_EVENT_CHANNEL, wrappedListener);
      return () => ipcRenderer.removeListener(BROWSER_EVENT_CHANNEL, wrappedListener);
    },
  },
  getWsUrl: () => wsUrl,
  pickFolder: () => ipcRenderer.invoke(PICK_FOLDER_CHANNEL),
  confirm: (message) => ipcRenderer.invoke(CONFIRM_CHANNEL, message),
  setTheme: (theme) => ipcRenderer.invoke(SET_THEME_CHANNEL, theme),
  showContextMenu: (items, position) => ipcRenderer.invoke(CONTEXT_MENU_CHANNEL, items, position),
  openExternal: (url: string) => ipcRenderer.invoke(OPEN_EXTERNAL_CHANNEL, url),
  onMenuAction: (listener) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, action: unknown) => {
      if (typeof action !== "string") return;
      listener(action);
    };

    ipcRenderer.on(MENU_ACTION_CHANNEL, wrappedListener);
    return () => {
      ipcRenderer.removeListener(MENU_ACTION_CHANNEL, wrappedListener);
    };
  },
  getUpdateState: () => ipcRenderer.invoke(UPDATE_GET_STATE_CHANNEL),
  downloadUpdate: () => ipcRenderer.invoke(UPDATE_DOWNLOAD_CHANNEL),
  installUpdate: () => ipcRenderer.invoke(UPDATE_INSTALL_CHANNEL),
  onUpdateState: (listener) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, state: unknown) => {
      if (typeof state !== "object" || state === null) return;
      listener(state as Parameters<typeof listener>[0]);
    };

    ipcRenderer.on(UPDATE_STATE_CHANNEL, wrappedListener);
    return () => {
      ipcRenderer.removeListener(UPDATE_STATE_CHANNEL, wrappedListener);
    };
  },
} satisfies DesktopBridge);
