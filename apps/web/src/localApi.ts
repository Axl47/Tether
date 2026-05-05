import type { ContextMenuItem, LocalApi } from "@t3tools/contracts";

import { resetGitStatusStateForTests } from "./lib/gitStatusState";
import { resetRequestLatencyStateForTests } from "./rpc/requestLatencyState";
import { resetServerStateForTests } from "./rpc/serverState";
import { resetWsConnectionStateForTests } from "./rpc/wsConnectionState";
import {
  resetSavedEnvironmentRegistryStoreForTests,
  resetSavedEnvironmentRuntimeStoreForTests,
} from "./environments/runtime";
import {
  getPrimaryEnvironmentConnection,
  resetEnvironmentServiceForTests,
} from "./environments/runtime";
import { type WsRpcClient } from "./rpc/wsRpcClient";
import { showContextMenuFallback } from "./contextMenuFallback";
import {
  readBrowserClientSettings,
  readBrowserSavedEnvironmentRegistry,
  readBrowserSavedEnvironmentSecret,
  removeBrowserSavedEnvironmentSecret,
  writeBrowserClientSettings,
  writeBrowserSavedEnvironmentRegistry,
  writeBrowserSavedEnvironmentSecret,
} from "./clientPersistenceStorage";

let cachedApi: LocalApi | undefined;
export function createLocalApi(rpcClient: WsRpcClient): LocalApi {
  const unsupportedProjectOperation = (name: string) =>
    new Error(`Local projects.${name} is unavailable in this runtime.`);
  const unsupportedBrowserOperation = (name: string) =>
    new Error(`Local browser.${name} is unavailable in this runtime.`);
  const unsupportedOrchestrationOperation = (name: string) =>
    new Error(`Local orchestration.${name} is unavailable in this runtime.`);
  const desktopBrowser = typeof window === "undefined" ? undefined : window.desktopBridge?.browser;

  return {
    dialogs: {
      pickFolder: async (options) => {
        if (!window.desktopBridge) return null;
        return window.desktopBridge.pickFolder(options);
      },
      confirm: async (message) => {
        if (window.desktopBridge) {
          return window.desktopBridge.confirm(message);
        }
        return window.confirm(message);
      },
    },
    terminal: {
      open: (input) => rpcClient.terminal.open(input as never),
      write: (input) => rpcClient.terminal.write(input as never),
      resize: (input) => rpcClient.terminal.resize(input as never),
      clear: (input) => rpcClient.terminal.clear(input as never),
      restart: (input) => rpcClient.terminal.restart(input as never),
      close: (input) => rpcClient.terminal.close(input as never),
      onEvent: (callback) => rpcClient.terminal.onEvent(callback),
    },
    projects: {
      searchEntries: rpcClient.projects.searchEntries,
      readFile: async () => {
        throw unsupportedProjectOperation("readFile");
      },
      writeFile: rpcClient.projects.writeFile,
    },
    filesystem: {
      browse: rpcClient.filesystem.browse,
    },
    git: {
      pull: rpcClient.git.pull,
      refreshStatus: rpcClient.git.refreshStatus,
      onStatus: (input, callback, options) => rpcClient.git.onStatus(input, callback, options),
      listBranches: rpcClient.git.listBranches,
      createWorktree: rpcClient.git.createWorktree,
      removeWorktree: rpcClient.git.removeWorktree,
      createBranch: rpcClient.git.createBranch,
      checkout: rpcClient.git.checkout,
      init: rpcClient.git.init,
      resolvePullRequest: rpcClient.git.resolvePullRequest,
      preparePullRequestThread: rpcClient.git.preparePullRequestThread,
    },
    browser: {
      ensurePane: async (input) => {
        if (!desktopBrowser) {
          throw unsupportedBrowserOperation("ensurePane");
        }
        return desktopBrowser.ensurePane(input);
      },
      destroyPane: async (input) => {
        if (!desktopBrowser) {
          throw unsupportedBrowserOperation("destroyPane");
        }
        return desktopBrowser.destroyPane(input);
      },
      setBounds: async (input) => {
        if (!desktopBrowser) {
          throw unsupportedBrowserOperation("setBounds");
        }
        return desktopBrowser.setBounds(input);
      },
      setVisible: async (input) => {
        if (!desktopBrowser) {
          throw unsupportedBrowserOperation("setVisible");
        }
        return desktopBrowser.setVisible(input);
      },
      navigate: async (input) => {
        if (!desktopBrowser) {
          throw unsupportedBrowserOperation("navigate");
        }
        return desktopBrowser.navigate(input);
      },
      goBack: async (input) => {
        if (!desktopBrowser) {
          throw unsupportedBrowserOperation("goBack");
        }
        return desktopBrowser.goBack(input);
      },
      goForward: async (input) => {
        if (!desktopBrowser) {
          throw unsupportedBrowserOperation("goForward");
        }
        return desktopBrowser.goForward(input);
      },
      reload: async (input) => {
        if (!desktopBrowser) {
          throw unsupportedBrowserOperation("reload");
        }
        return desktopBrowser.reload(input);
      },
      stop: async (input) => {
        if (!desktopBrowser) {
          throw unsupportedBrowserOperation("stop");
        }
        return desktopBrowser.stop(input);
      },
      captureScreenshot: async (input) => {
        if (!desktopBrowser) {
          throw unsupportedBrowserOperation("captureScreenshot");
        }
        return desktopBrowser.captureScreenshot(input);
      },
      getSnapshot: async (input) => {
        if (!desktopBrowser) {
          throw unsupportedBrowserOperation("getSnapshot");
        }
        return desktopBrowser.getSnapshot(input);
      },
      onEvent: (callback) => {
        if (!desktopBrowser) {
          return () => undefined;
        }
        return desktopBrowser.onEvent(callback);
      },
      syncShortcutState: async (state) => {
        if (!desktopBrowser) {
          throw unsupportedBrowserOperation("syncShortcutState");
        }
        return desktopBrowser.syncShortcutState(state);
      },
    },
    orchestration: {
      getSnapshot: async () => {
        throw unsupportedOrchestrationOperation("getSnapshot");
      },
      dispatchCommand: rpcClient.orchestration.dispatchCommand,
      forceDeleteThread: async () => {
        throw unsupportedOrchestrationOperation("forceDeleteThread");
      },
      getTurnDiff: rpcClient.orchestration.getTurnDiff,
      getFullThreadDiff: rpcClient.orchestration.getFullThreadDiff,
      autorenameProjectThreads: async () => {
        throw unsupportedOrchestrationOperation("autorenameProjectThreads");
      },
      replayEvents: async () => [],
      onDomainEvent: () => () => undefined,
      subscribeShell: (callback, options) =>
        rpcClient.orchestration.subscribeShell(callback, options),
      subscribeThread: (input, callback, options) =>
        rpcClient.orchestration.subscribeThread(input, callback, options),
    },
    shell: {
      openInEditor: (cwd, editor) => rpcClient.shell.openInEditor({ cwd, editor }),
      openExternal: async (url) => {
        if (window.desktopBridge) {
          const opened = await window.desktopBridge.openExternal(url);
          if (!opened) {
            throw new Error("Unable to open link.");
          }
          return;
        }

        window.open(url, "_blank", "noopener,noreferrer");
      },
    },
    contextMenu: {
      show: async <T extends string>(
        items: readonly ContextMenuItem<T>[],
        position?: { x: number; y: number },
      ): Promise<T | null> => {
        if (window.desktopBridge) {
          return window.desktopBridge.showContextMenu(items, position) as Promise<T | null>;
        }
        return showContextMenuFallback(items, position);
      },
    },
    persistence: {
      getClientSettings: async () => {
        if (window.desktopBridge) {
          return window.desktopBridge.getClientSettings();
        }
        return readBrowserClientSettings();
      },
      setClientSettings: async (settings) => {
        if (window.desktopBridge) {
          return window.desktopBridge.setClientSettings(settings);
        }
        writeBrowserClientSettings(settings);
      },
      getSavedEnvironmentRegistry: async () => {
        if (window.desktopBridge) {
          return window.desktopBridge.getSavedEnvironmentRegistry();
        }
        return readBrowserSavedEnvironmentRegistry();
      },
      setSavedEnvironmentRegistry: async (records) => {
        if (window.desktopBridge) {
          return window.desktopBridge.setSavedEnvironmentRegistry(records);
        }
        writeBrowserSavedEnvironmentRegistry(records);
      },
      getSavedEnvironmentSecret: async (environmentId) => {
        if (window.desktopBridge) {
          return window.desktopBridge.getSavedEnvironmentSecret(environmentId);
        }
        return readBrowserSavedEnvironmentSecret(environmentId);
      },
      setSavedEnvironmentSecret: async (environmentId, secret) => {
        if (window.desktopBridge) {
          return window.desktopBridge.setSavedEnvironmentSecret(environmentId, secret);
        }
        return writeBrowserSavedEnvironmentSecret(environmentId, secret);
      },
      removeSavedEnvironmentSecret: async (environmentId) => {
        if (window.desktopBridge) {
          return window.desktopBridge.removeSavedEnvironmentSecret(environmentId);
        }
        removeBrowserSavedEnvironmentSecret(environmentId);
      },
    },
    server: {
      getConfig: rpcClient.server.getConfig,
      getDesktopContext: rpcClient.server.getDesktopContext,
      setDesktopContext: rpcClient.server.setDesktopContext,
      refreshProviders: rpcClient.server.refreshProviders,
      upsertKeybinding: rpcClient.server.upsertKeybinding,
      getSettings: rpcClient.server.getSettings,
      updateSettings: rpcClient.server.updateSettings,
    },
  };
}

export function readLocalApi(): LocalApi | undefined {
  if (typeof window === "undefined") return undefined;
  if (cachedApi) return cachedApi;

  if (window.nativeApi) {
    cachedApi = window.nativeApi;
    return cachedApi;
  }

  cachedApi = createLocalApi(getPrimaryEnvironmentConnection().client);
  return cachedApi;
}

export function ensureLocalApi(): LocalApi {
  const api = readLocalApi();
  if (!api) {
    throw new Error("Local API not found");
  }
  return api;
}

export async function __resetLocalApiForTests() {
  cachedApi = undefined;
  const { __resetClientSettingsPersistenceForTests } = await import("./hooks/useSettings");
  __resetClientSettingsPersistenceForTests();
  await resetEnvironmentServiceForTests();
  resetGitStatusStateForTests();
  resetRequestLatencyStateForTests();
  resetSavedEnvironmentRegistryStoreForTests();
  resetSavedEnvironmentRuntimeStoreForTests();
  resetServerStateForTests();
  resetWsConnectionStateForTests();
}
