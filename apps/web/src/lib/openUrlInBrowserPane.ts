import type { ThreadId } from "@t3tools/contracts";
import { useBrowserPaneRuntimeStore } from "../browserPaneRuntimeStore";
import { readNativeApi } from "../nativeApi";
import { findBrowserLeafByPaneId, useSplitViewStore } from "../splitViewStore";

export type OpenUrlInBrowserPaneResult =
  | { kind: "reused-existing-pane"; paneId: string }
  | { kind: "created-new-pane"; paneId: string };

function requireDesktopBrowserApi() {
  const api = readNativeApi();
  if (!api) {
    throw new Error("Browser panes require desktop mode.");
  }
  return api;
}

function focusedBrowserPaneIdInActiveWorkspace(): string | null {
  const splitState = useSplitViewStore.getState();
  const focusedPaneId = useBrowserPaneRuntimeStore.getState().focusedPaneId;
  if (!splitState.group || !focusedPaneId) {
    return null;
  }
  return findBrowserLeafByPaneId(splitState.group.root, focusedPaneId)?.paneId ?? null;
}

export function isExternalHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export async function openUrlInBrowserPane(input: {
  url: string;
  threadId: ThreadId;
}): Promise<OpenUrlInBrowserPaneResult> {
  const { url, threadId } = input;
  const api = requireDesktopBrowserApi();
  const splitState = useSplitViewStore.getState();
  const focusedPaneId = focusedBrowserPaneIdInActiveWorkspace();

  if (focusedPaneId && splitState.group) {
    const focusedLeaf = findBrowserLeafByPaneId(splitState.group.root, focusedPaneId);
    if (focusedLeaf) {
      splitState.updateBrowserPanePersistedState(focusedLeaf.paneId, { url });
      await api.browser.ensurePane({
        paneId: focusedLeaf.paneId,
        url,
        targetThreadId: focusedLeaf.targetThreadId,
        createdFromThreadId: focusedLeaf.createdFromThreadId,
      });
      await api.browser.navigate({ paneId: focusedLeaf.paneId, url });
      return { kind: "reused-existing-pane", paneId: focusedLeaf.paneId };
    }
  }

  const paneId = splitState.splitThreadWithBrowser(threadId, "horizontal");
  if (!paneId) {
    throw new Error("Unable to create browser pane.");
  }

  const nextSplitState = useSplitViewStore.getState();
  const createdLeaf = nextSplitState.group
    ? findBrowserLeafByPaneId(nextSplitState.group.root, paneId)
    : null;
  if (!createdLeaf) {
    throw new Error("Unable to locate created browser pane.");
  }

  nextSplitState.updateBrowserPanePersistedState(paneId, { url });
  await api.browser.ensurePane({
    paneId,
    url,
    targetThreadId: createdLeaf.targetThreadId,
    createdFromThreadId: createdLeaf.createdFromThreadId,
  });
  await api.browser.navigate({ paneId, url });
  return { kind: "created-new-pane", paneId };
}
