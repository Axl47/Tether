import type { EnvironmentId, EnvironmentApi } from "@t3tools/contracts";

import type { WsRpcClient } from "./rpc/wsRpcClient";
import { readEnvironmentConnection } from "./environments/runtime";

const environmentApiOverridesForTests = new Map<EnvironmentId, EnvironmentApi>();

export function createEnvironmentApi(rpcClient: WsRpcClient): EnvironmentApi {
  const unsupportedOrchestrationOperation = (name: string) =>
    new Error(`Environment orchestration.${name} is unavailable in this runtime.`);
  const unsupportedBrowserOperation = (name: string) =>
    new Error(`Environment browser.${name} is unavailable in this runtime.`);
  const desktopBrowser = typeof window === "undefined" ? undefined : window.desktopBridge?.browser;

  return {
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
        throw new Error("Environment projects.readFile is unavailable in this runtime.");
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
  };
}

export function readEnvironmentApi(environmentId: EnvironmentId): EnvironmentApi | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  if (!environmentId) {
    return undefined;
  }

  const overriddenApi = environmentApiOverridesForTests.get(environmentId);
  if (overriddenApi) {
    return overriddenApi;
  }

  const connection = readEnvironmentConnection(environmentId);
  return connection ? createEnvironmentApi(connection.client) : undefined;
}

export function ensureEnvironmentApi(environmentId: EnvironmentId): EnvironmentApi {
  const api = readEnvironmentApi(environmentId);
  if (!api) {
    throw new Error(`Environment API not found for environment ${environmentId}`);
  }
  return api;
}

export function __setEnvironmentApiOverrideForTests(
  environmentId: EnvironmentId,
  api: EnvironmentApi,
): void {
  environmentApiOverridesForTests.set(environmentId, api);
}

export function __resetEnvironmentApiOverridesForTests(): void {
  environmentApiOverridesForTests.clear();
}
