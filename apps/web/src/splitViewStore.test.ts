import { beforeEach, describe, expect, it } from "vitest";
import { ThreadId } from "@t3tools/contracts";

import { collectThreadIds, findBrowserLeafByPaneId, findLeafByThreadId, useSplitViewStore } from "./splitViewStore";

const THREAD_A = ThreadId.makeUnsafe("thread-a");
const THREAD_B = ThreadId.makeUnsafe("thread-b");
const THREAD_C = ThreadId.makeUnsafe("thread-c");
const THREAD_D = ThreadId.makeUnsafe("thread-d");

describe("splitViewStore workspaces", () => {
  beforeEach(() => {
    useSplitViewStore.setState({ workspaces: [], activeWorkspaceId: null, group: null, dragOver: null, zoomed: false });
    if (typeof window !== "undefined") {
      window.localStorage.clear();
      Object.defineProperty(window, "desktopBridge", { value: {}, configurable: true, writable: true });
    }
  });

  it("creates multiple workspaces over time instead of reusing one global split", () => {
    useSplitViewStore.getState().splitThread(THREAD_A, THREAD_B, "horizontal", false);
    const firstWorkspaceId = useSplitViewStore.getState().activeWorkspaceId;
    useSplitViewStore.getState().deactivateWorkspace();
    useSplitViewStore.getState().splitThread(THREAD_C, THREAD_D, "vertical", false);
    const state = useSplitViewStore.getState();
    expect(state.workspaces).toHaveLength(2);
    expect(state.activeWorkspaceId).not.toBe(firstWorkspaceId);
    expect(state.workspaces.map((workspace) => workspace.name)).toEqual(["Workspace 1", "Workspace 2"]);
  });

  it("supports splitting a thread with a browser pane", () => {
    useSplitViewStore.getState().splitThread(THREAD_A, THREAD_B, "horizontal", false);
    const paneId = useSplitViewStore.getState().splitThreadWithBrowser(THREAD_A, "vertical");
    const group = useSplitViewStore.getState().group;
    expect(paneId).toBeTruthy();
    expect(group).not.toBeNull();
    expect(group ? findBrowserLeafByPaneId(group.root, paneId!)?.targetThreadId : null).toBe(THREAD_A);
    expect(group ? collectThreadIds(group.root) : []).toEqual([THREAD_A, THREAD_B]);
  });

  it("closes a browser pane without dropping thread navigation", () => {
    useSplitViewStore.getState().splitThread(THREAD_A, THREAD_B, "horizontal", false);
    const paneId = useSplitViewStore.getState().splitThreadWithBrowser(THREAD_A, "horizontal");
    expect(paneId).toBeTruthy();
    const fallback = useSplitViewStore.getState().closeBrowserPane(paneId!);
    expect(fallback).toBeNull();
    const group = useSplitViewStore.getState().group;
    expect(group ? findBrowserLeafByPaneId(group.root, paneId!) : null).toBeNull();
    expect(group ? findLeafByThreadId(group.root, THREAD_A) : null).not.toBeNull();
  });
});
