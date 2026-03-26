import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThreadId } from "@t3tools/contracts";
import { useBrowserPaneRuntimeStore } from "../browserPaneRuntimeStore";
import { findBrowserLeafByPaneId, useSplitViewStore } from "../splitViewStore";
import * as nativeApiModule from "../nativeApi";
import { isExternalHttpUrl, openUrlInBrowserPane } from "./openUrlInBrowserPane";

const THREAD_A = ThreadId.makeUnsafe("thread-a");
const THREAD_B = ThreadId.makeUnsafe("thread-b");

describe("openUrlInBrowserPane", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useSplitViewStore.setState({
      workspaces: [],
      activeWorkspaceId: null,
      group: null,
      dragOver: null,
      zoomed: false,
    });
    useBrowserPaneRuntimeStore.setState({
      snapshotsByPaneId: {},
      focusedPaneId: null,
    });
    if (typeof window !== "undefined") {
      window.localStorage.clear();
      Object.defineProperty(window, "desktopBridge", {
        value: {},
        configurable: true,
        writable: true,
      });
    }
  });

  it("recognizes absolute http(s) URLs only", () => {
    expect(isExternalHttpUrl("https://example.com/docs")).toBe(true);
    expect(isExternalHttpUrl("http://example.com/docs")).toBe(true);
    expect(isExternalHttpUrl("/docs")).toBe(false);
    expect(isExternalHttpUrl("file:///tmp/test.txt")).toBe(false);
  });

  it("reuses the focused browser pane in the active workspace", async () => {
    useSplitViewStore.getState().splitThread(THREAD_A, THREAD_B, "horizontal", false);
    const paneId = useSplitViewStore.getState().splitThreadWithBrowser(THREAD_A, "horizontal");
    expect(paneId).toBeTruthy();
    useBrowserPaneRuntimeStore.setState({ focusedPaneId: paneId! });

    const ensurePane = vi.fn().mockResolvedValue(undefined);
    const navigate = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(nativeApiModule, "readNativeApi").mockReturnValue({
      browser: { ensurePane, navigate },
    } as never);

    const result = await openUrlInBrowserPane({
      url: "https://example.com/focused",
      threadId: THREAD_A,
    });

    expect(result).toEqual({ kind: "reused-existing-pane", paneId });
    expect(ensurePane).toHaveBeenCalledWith(
      expect.objectContaining({
        paneId,
        url: "https://example.com/focused",
        targetThreadId: THREAD_A,
        createdFromThreadId: THREAD_A,
      }),
    );
    expect(navigate).toHaveBeenCalledWith({
      paneId,
      url: "https://example.com/focused",
    });
    expect(
      useSplitViewStore.getState().group
        ? findBrowserLeafByPaneId(useSplitViewStore.getState().group!.root, paneId!)?.url
        : null,
    ).toBe("https://example.com/focused");
  });

  it("creates a new browser pane when no focused browser pane is available", async () => {
    const ensurePane = vi.fn().mockResolvedValue(undefined);
    const navigate = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(nativeApiModule, "readNativeApi").mockReturnValue({
      browser: { ensurePane, navigate },
    } as never);

    const result = await openUrlInBrowserPane({
      url: "https://example.com/new-pane",
      threadId: THREAD_A,
    });

    expect(result.kind).toBe("created-new-pane");
    expect(ensurePane).toHaveBeenCalledWith(
      expect.objectContaining({
        paneId: result.paneId,
        url: "https://example.com/new-pane",
        targetThreadId: THREAD_A,
        createdFromThreadId: THREAD_A,
      }),
    );
    expect(navigate).toHaveBeenCalledWith({
      paneId: result.paneId,
      url: "https://example.com/new-pane",
    });
    expect(
      useSplitViewStore.getState().group
        ? findBrowserLeafByPaneId(useSplitViewStore.getState().group!.root, result.paneId)?.url
        : null,
    ).toBe("https://example.com/new-pane");
  });

  it("creates a new browser pane when the focused pane is not in the active workspace", async () => {
    useSplitViewStore.getState().splitThread(THREAD_A, THREAD_B, "horizontal", false);
    const firstPaneId = useSplitViewStore.getState().splitThreadWithBrowser(THREAD_A, "horizontal");
    expect(firstPaneId).toBeTruthy();
    const firstWorkspaceId = useSplitViewStore.getState().activeWorkspaceId;

    useSplitViewStore.getState().deactivateWorkspace();
    useSplitViewStore
      .getState()
      .splitThread(
        ThreadId.makeUnsafe("thread-c"),
        ThreadId.makeUnsafe("thread-d"),
        "horizontal",
        false,
      );
    expect(useSplitViewStore.getState().activeWorkspaceId).not.toBe(firstWorkspaceId);
    useBrowserPaneRuntimeStore.setState({ focusedPaneId: firstPaneId! });

    const ensurePane = vi.fn().mockResolvedValue(undefined);
    const navigate = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(nativeApiModule, "readNativeApi").mockReturnValue({
      browser: { ensurePane, navigate },
    } as never);

    const result = await openUrlInBrowserPane({
      url: "https://example.com/other-workspace",
      threadId: ThreadId.makeUnsafe("thread-c"),
    });

    expect(result.kind).toBe("created-new-pane");
    expect(result.paneId).not.toBe(firstPaneId);
  });
});
