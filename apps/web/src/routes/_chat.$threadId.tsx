import { type ProjectId, ThreadId } from "@t3tools/contracts";
import { createFileRoute, retainSearchParams, useNavigate } from "@tanstack/react-router";
import { Suspense, lazy, useState, useMemo, type ReactNode, useCallback, useEffect } from "react";

import ChatView from "../components/ChatView";
import { DiffWorkerPoolProvider } from "../components/DiffWorkerPoolProvider";
import {
  DiffPanelHeaderSkeleton,
  DiffPanelLoadingState,
  DiffPanelShell,
  type DiffPanelMode,
} from "../components/DiffPanelShell";
import { SplitPanelRoot, SplitDropPreview, SplitPlaceholder } from "../components/SplitPanel";
import { BrowserPane } from "../components/BrowserPane";
import { useComposerDraftStore } from "../composerDraftStore";
import {
  clearDiffSearchParams,
  type DiffRouteSearch,
  parseDiffRouteSearch,
  stripDiffSearchParams,
} from "../diffRouteSearch";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useStore } from "../store";
import { useCommandPaletteStore } from "../commandPaletteStore";
import {
  useSplitViewStore,
  computeClosestDropZone,
  dropZoneToSplit,
  type DropZone,
  type SplitLeaf,
  findLeaf,
  findLeafByThreadId,
  firstLeaf,
} from "../splitViewStore";
import { newThreadId } from "../lib/utils";
import { Sheet, SheetPopup } from "../components/ui/sheet";
import { Sidebar, SidebarInset, SidebarProvider, SidebarRail } from "~/components/ui/sidebar";

const DiffPanel = lazy(() => import("../components/DiffPanel"));
const DIFF_INLINE_LAYOUT_MEDIA_QUERY = "(max-width: 1180px)";
const DIFF_INLINE_SIDEBAR_WIDTH_STORAGE_KEY = "chat_diff_sidebar_width";
const DIFF_INLINE_DEFAULT_WIDTH = "clamp(28rem,48vw,44rem)";
const DIFF_INLINE_SIDEBAR_MIN_WIDTH = 26 * 16;
const COMPOSER_COMPACT_MIN_LEFT_CONTROLS_WIDTH_PX = 208;

const DiffPanelSheet = (props: {
  children: ReactNode;
  diffOpen: boolean;
  onCloseDiff: () => void;
}) => {
  return (
    <Sheet
      open={props.diffOpen}
      onOpenChange={(open) => {
        if (!open) {
          props.onCloseDiff();
        }
      }}
    >
      <SheetPopup
        side="right"
        showCloseButton={false}
        keepMounted
        className="w-[min(88vw,820px)] max-w-[820px] p-0"
      >
        {props.children}
      </SheetPopup>
    </Sheet>
  );
};

const DiffLoadingFallback = (props: { mode: DiffPanelMode }) => {
  return (
    <DiffPanelShell mode={props.mode} header={<DiffPanelHeaderSkeleton />}>
      <DiffPanelLoadingState label="Loading diff viewer..." />
    </DiffPanelShell>
  );
};

const LazyDiffPanel = (props: { mode: DiffPanelMode }) => {
  return (
    <DiffWorkerPoolProvider>
      <Suspense fallback={<DiffLoadingFallback mode={props.mode} />}>
        <DiffPanel mode={props.mode} />
      </Suspense>
    </DiffWorkerPoolProvider>
  );
};

const DiffPanelInlineSidebar = (props: {
  diffOpen: boolean;
  onCloseDiff: () => void;
  onOpenDiff: () => void;
  renderDiffContent: boolean;
}) => {
  const { diffOpen, onCloseDiff, onOpenDiff, renderDiffContent } = props;
  const onOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        onOpenDiff();
        return;
      }
      onCloseDiff();
    },
    [onCloseDiff, onOpenDiff],
  );
  const shouldAcceptInlineSidebarWidth = useCallback(
    ({ nextWidth, wrapper }: { nextWidth: number; wrapper: HTMLElement }) => {
      const composerForm = document.querySelector<HTMLElement>("[data-chat-composer-form='true']");
      if (!composerForm) return true;
      const composerViewport = composerForm.parentElement;
      if (!composerViewport) return true;
      const previousSidebarWidth = wrapper.style.getPropertyValue("--sidebar-width");
      wrapper.style.setProperty("--sidebar-width", `${nextWidth}px`);

      const viewportStyle = window.getComputedStyle(composerViewport);
      const viewportPaddingLeft = Number.parseFloat(viewportStyle.paddingLeft) || 0;
      const viewportPaddingRight = Number.parseFloat(viewportStyle.paddingRight) || 0;
      const viewportContentWidth = Math.max(
        0,
        composerViewport.clientWidth - viewportPaddingLeft - viewportPaddingRight,
      );
      const formRect = composerForm.getBoundingClientRect();
      const composerFooter = composerForm.querySelector<HTMLElement>(
        "[data-chat-composer-footer='true']",
      );
      const composerRightActions = composerForm.querySelector<HTMLElement>(
        "[data-chat-composer-actions='right']",
      );
      const composerRightActionsWidth = composerRightActions?.getBoundingClientRect().width ?? 0;
      const composerFooterGap = composerFooter
        ? Number.parseFloat(window.getComputedStyle(composerFooter).columnGap) ||
          Number.parseFloat(window.getComputedStyle(composerFooter).gap) ||
          0
        : 0;
      const minimumComposerWidth =
        COMPOSER_COMPACT_MIN_LEFT_CONTROLS_WIDTH_PX + composerRightActionsWidth + composerFooterGap;
      const hasComposerOverflow = composerForm.scrollWidth > composerForm.clientWidth + 0.5;
      const overflowsViewport = formRect.width > viewportContentWidth + 0.5;
      const violatesMinimumComposerWidth = composerForm.clientWidth + 0.5 < minimumComposerWidth;

      if (previousSidebarWidth.length > 0) {
        wrapper.style.setProperty("--sidebar-width", previousSidebarWidth);
      } else {
        wrapper.style.removeProperty("--sidebar-width");
      }

      return !hasComposerOverflow && !overflowsViewport && !violatesMinimumComposerWidth;
    },
    [],
  );

  return (
    <SidebarProvider
      defaultOpen={false}
      open={diffOpen}
      onOpenChange={onOpenChange}
      className="w-auto min-h-0 flex-none bg-transparent"
      style={{ "--sidebar-width": DIFF_INLINE_DEFAULT_WIDTH } as React.CSSProperties}
    >
      <Sidebar
        side="right"
        collapsible="offcanvas"
        className="border-l border-border bg-card text-foreground"
        resizable={{
          minWidth: DIFF_INLINE_SIDEBAR_MIN_WIDTH,
          shouldAcceptWidth: shouldAcceptInlineSidebarWidth,
          storageKey: DIFF_INLINE_SIDEBAR_WIDTH_STORAGE_KEY,
        }}
      >
        {renderDiffContent ? <LazyDiffPanel mode="sidebar" /> : null}
        <SidebarRail />
      </Sidebar>
    </SidebarProvider>
  );
};

/** Renders a single thread pane inside a split leaf. */
function SplitThreadPane({
  threadId,
  onCloseSplitPane,
}: {
  threadId: ThreadId;
  onCloseSplitPane: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-background text-foreground">
      <ChatView key={threadId} threadId={threadId} onCloseSplitPane={onCloseSplitPane} />
    </div>
  );
}

function ChatThreadRouteView() {
  const threadsHydrated = useStore((store) => store.threadsHydrated);
  const threads = useStore((store) => store.threads);
  const navigate = useNavigate();
  const threadId = Route.useParams({
    select: (params) => ThreadId.makeUnsafe(params.threadId),
  });
  const search = Route.useSearch();
  const draftThreadsByThreadId = useComposerDraftStore((store) => store.draftThreadsByThreadId);
  const threadExists = threads.some((thread) => thread.id === threadId);
  const draftThreadExists = Object.hasOwn(draftThreadsByThreadId, threadId);
  const routeThreadExists = threadExists || draftThreadExists;
  const diffOpen = search.diff === "1";
  const shouldUseDiffSheet = useMediaQuery(DIFF_INLINE_LAYOUT_MEDIA_QUERY);
  const [hasOpenedDiff, setHasOpenedDiff] = useState(diffOpen);
  const commandPaletteOpen = useCommandPaletteStore((state) => state.open);
  const commandPaletteMode = useCommandPaletteStore((state) => state.mode);
  const commandPalettePreviewLeafId = useCommandPaletteStore((state) => state.previewLeafId);
  const commandPalettePreviewThreadId = useCommandPaletteStore((state) => state.previewThreadId);

  // Split view state
  const splitGroup = useSplitViewStore((s) => s.group);
  const workspaces = useSplitViewStore((s) => s.workspaces);
  const activateWorkspace = useSplitViewStore((s) => s.activateWorkspace);
  const setFocusedLeaf = useSplitViewStore((s) => s.setFocusedLeaf);
  const splitThread = useSplitViewStore((s) => s.splitThread);
  const splitLeaf = useSplitViewStore((s) => s.splitLeaf);
  const replaceThreadInLeaf = useSplitViewStore((s) => s.replaceThreadInLeaf);
  const reconcileThreads = useSplitViewStore((s) => s.reconcileThreads);
  const setProjectDraftThreadId = useComposerDraftStore((s) => s.setProjectDraftThreadId);
  const isSplitView = splitGroup !== null;

  // Drop zone visual state for single-thread mode
  const [initialDropZone, setInitialDropZone] = useState<DropZone | null>(null);

  const createProjectDraftThread = useCallback(
    (projectId: ProjectId): ThreadId => {
      const tid = newThreadId();
      setProjectDraftThreadId(projectId, tid, {
        createdAt: new Date().toISOString(),
        branch: null,
        worktreePath: null,
        envMode: "local",
        runtimeMode: "full-access",
      });
      return tid;
    },
    [setProjectDraftThreadId],
  );

  /** Handle a thread/project dropped onto a split pane's drop zone. */
  const handleSplitDrop = useCallback(
    (
      leafId: string,
      droppedThreadId: ThreadId | null,
      projectId: string | null,
      zone: DropZone,
    ) => {
      if (droppedThreadId) {
        const workspaceWithThread = workspaces.find((workspace) =>
          findLeafByThreadId(workspace.root, droppedThreadId),
        );
        const existingWorkspaceLeaf = workspaceWithThread
          ? findLeafByThreadId(workspaceWithThread.root, droppedThreadId)
          : null;

        if (workspaceWithThread && existingWorkspaceLeaf) {
          activateWorkspace(workspaceWithThread.id);
          setFocusedLeaf(existingWorkspaceLeaf.id);
          void navigate({
            to: "/$threadId",
            params: { threadId: droppedThreadId },
          });
          return;
        }

        if (zone === "center") {
          if (!isSplitView) {
            void navigate({
              to: "/$threadId",
              params: { threadId: droppedThreadId },
            });
            return;
          }
          const existingLeaf = splitGroup
            ? findLeafByThreadId(splitGroup.root, droppedThreadId)
            : null;
          if (existingLeaf) {
            setFocusedLeaf(existingLeaf.id);
          } else {
            replaceThreadInLeaf(leafId, droppedThreadId);
          }
          return;
        }
        const { direction, insertBefore } = dropZoneToSplit(zone);
        if (isSplitView) {
          splitLeaf(leafId, droppedThreadId, direction, insertBefore);
        } else {
          splitThread(threadId, droppedThreadId, direction, insertBefore);
        }
      } else if (projectId) {
        const tid = createProjectDraftThread(projectId as ProjectId);
        if (zone === "center") {
          if (isSplitView) {
            replaceThreadInLeaf(leafId, tid);
          } else {
            void navigate({
              to: "/$threadId",
              params: { threadId: tid },
            });
          }
          return;
        }
        const { direction, insertBefore } = dropZoneToSplit(zone);
        if (isSplitView) {
          splitLeaf(leafId, tid, direction, insertBefore);
        } else {
          splitThread(threadId, tid, direction, insertBefore);
        }
      }
    },
    [
      activateWorkspace,
      createProjectDraftThread,
      isSplitView,
      navigate,
      replaceThreadInLeaf,
      setFocusedLeaf,
      splitGroup,
      splitLeaf,
      splitThread,
      threadId,
      workspaces,
    ],
  );

  /** Handle initial drop onto the single-thread view (not yet split). */
  const handleInitialDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const droppedThreadId = e.dataTransfer.getData("application/t3-thread-id") || null;
      const droppedProjectId = e.dataTransfer.getData("application/t3-project-id") || null;
      const dragType = e.dataTransfer.getData("application/t3-drag-type");

      const rect = e.currentTarget.getBoundingClientRect();
      const zone = computeClosestDropZone(e.clientX, e.clientY, rect);
      if (dragType === "project" && droppedProjectId) {
        const tid = createProjectDraftThread(droppedProjectId as ProjectId);
        if (zone === "center") {
          void navigate({
            to: "/$threadId",
            params: { threadId: tid },
          });
          return;
        }
        const { direction, insertBefore } = dropZoneToSplit(zone);
        splitThread(threadId, tid, direction, insertBefore);
      } else if (droppedThreadId && droppedThreadId !== threadId) {
        const workspaceWithThread = workspaces.find((workspace) =>
          findLeafByThreadId(workspace.root, droppedThreadId as ThreadId),
        );
        const existingWorkspaceLeaf = workspaceWithThread
          ? findLeafByThreadId(workspaceWithThread.root, droppedThreadId as ThreadId)
          : null;
        if (workspaceWithThread && existingWorkspaceLeaf) {
          activateWorkspace(workspaceWithThread.id);
          setFocusedLeaf(existingWorkspaceLeaf.id);
          void navigate({
            to: "/$threadId",
            params: { threadId: droppedThreadId as ThreadId },
          });
          return;
        }
        if (zone === "center") {
          void navigate({
            to: "/$threadId",
            params: { threadId: droppedThreadId as ThreadId },
          });
          return;
        }
        const { direction, insertBefore } = dropZoneToSplit(zone);
        splitThread(threadId, droppedThreadId as ThreadId, direction, insertBefore);
      }
    },
    [
      activateWorkspace,
      createProjectDraftThread,
      navigate,
      setFocusedLeaf,
      splitThread,
      threadId,
      workspaces,
    ],
  );

  const availableThreadIds = useMemo(() => {
    const next = new Set<ThreadId>();
    for (const thread of threads) {
      next.add(thread.id);
    }
    for (const draftThreadId of Object.keys(draftThreadsByThreadId) as ThreadId[]) {
      next.add(draftThreadId);
    }
    return next;
  }, [draftThreadsByThreadId, threads]);

  const routeFallbackThreadId = useMemo(() => {
    if (!splitGroup) return null;
    const focusedLeaf = findLeaf(splitGroup.root, splitGroup.focusedLeafId);
    if (focusedLeaf?.paneType === "thread") return focusedLeaf.threadId;
    if (focusedLeaf?.paneType === "browser") return focusedLeaf.targetThreadId;
    const first = firstLeaf(splitGroup.root);
    return first.paneType === "thread" ? first.threadId : first.targetThreadId;
  }, [splitGroup]);
  const focusedThreadId = routeFallbackThreadId ?? threadId;

  const closeDiff = useCallback(() => {
    void navigate({
      to: "/$threadId",
      params: { threadId: focusedThreadId },
      search: (previous) => {
        return clearDiffSearchParams(previous) as unknown as DiffRouteSearch;
      },
    });
  }, [focusedThreadId, navigate]);
  const openDiff = useCallback(() => {
    void navigate({
      to: "/$threadId",
      params: { threadId: focusedThreadId },
      search: (previous) => {
        const rest = stripDiffSearchParams(previous);
        return { ...rest, diff: "1" };
      },
    });
  }, [focusedThreadId, navigate]);

  const focusSplitThread = useCallback(
    (focusedLeafThreadId: ThreadId) => {
      if (focusedLeafThreadId === threadId) return;
      void navigate({
        to: "/$threadId",
        params: { threadId: focusedLeafThreadId },
        replace: true,
        search: (previous) => previous,
      });
    },
    [navigate, threadId],
  );

  useEffect(() => {
    if (diffOpen) {
      setHasOpenedDiff(true);
    }
  }, [diffOpen]);

  useEffect(() => {
    if (!threadsHydrated) {
      return;
    }

    const remainingThreadId = reconcileThreads(availableThreadIds);
    if (!routeThreadExists && remainingThreadId && remainingThreadId !== threadId) {
      void navigate({
        to: "/$threadId",
        params: { threadId: remainingThreadId },
        replace: true,
      });
    }
  }, [
    availableThreadIds,
    navigate,
    reconcileThreads,
    routeThreadExists,
    threadId,
    threadsHydrated,
  ]);

  useEffect(() => {
    if (!threadsHydrated || routeThreadExists || isSplitView) {
      return;
    }

    if (routeFallbackThreadId && routeFallbackThreadId !== threadId) {
      void navigate({
        to: "/$threadId",
        params: { threadId: routeFallbackThreadId },
        replace: true,
      });
      return;
    }
    void navigate({ to: "/", replace: true });
  }, [isSplitView, navigate, routeFallbackThreadId, routeThreadExists, threadsHydrated, threadId]);

  useEffect(() => {
    if (
      !threadsHydrated ||
      !isSplitView ||
      !routeFallbackThreadId ||
      routeFallbackThreadId === threadId
    ) {
      return;
    }
    if (!availableThreadIds.has(routeFallbackThreadId)) {
      return;
    }
    void navigate({
      to: "/$threadId",
      params: { threadId: routeFallbackThreadId },
      replace: true,
      search: (previous) => previous,
    });
  }, [availableThreadIds, isSplitView, navigate, routeFallbackThreadId, threadId, threadsHydrated]);

  if (!threadsHydrated || (!routeThreadExists && !isSplitView)) {
    return null;
  }

  const shouldRenderDiffContent = diffOpen || hasOpenedDiff;

  // ── Split view mode ──────────────────────────────────────────────
  if (isSplitView) {
    const renderLeaf = (leaf: SplitLeaf) => {
      if (leaf.paneType === "browser") {
        return <BrowserPane leaf={leaf} />;
      }
      const tid = leaf.threadId;
      const isPaletteSplitPreview =
        commandPaletteOpen &&
        commandPaletteMode !== "default" &&
        commandPalettePreviewLeafId === leaf.id &&
        commandPalettePreviewThreadId === tid;

      if (isPaletteSplitPreview) {
        return (
          <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-background p-2 text-foreground">
            <SplitPlaceholder />
          </div>
        );
      }

      const onClose = () => {
        const remaining = useSplitViewStore.getState().closePane(leaf.id);
        if (remaining) {
          void navigate({
            to: "/$threadId",
            params: { threadId: remaining },
          });
        }
      };
      return <SplitThreadPane threadId={tid} onCloseSplitPane={onClose} />;
    };

    return (
      <div className="flex h-dvh w-full min-h-0 min-w-0 flex-col overflow-hidden">
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <SidebarInset className="min-h-0 flex-1 overflow-hidden overscroll-y-none bg-muted py-3 pl-2 pr-3 text-foreground dark:bg-card">
            <SplitPanelRoot
              renderLeaf={renderLeaf}
              onSplitDrop={handleSplitDrop}
              onFocusLeaf={(leaf) => { if (leaf.paneType === "thread") focusSplitThread(leaf.threadId); }}
            />
          </SidebarInset>
          {!shouldUseDiffSheet && (
            <DiffPanelInlineSidebar
              diffOpen={diffOpen}
              onCloseDiff={closeDiff}
              onOpenDiff={openDiff}
              renderDiffContent={diffOpen || hasOpenedDiff}
            />
          )}
          {shouldUseDiffSheet && (
            <DiffPanelSheet diffOpen={diffOpen} onCloseDiff={closeDiff}>
              <Suspense fallback={<DiffLoadingFallback mode="sheet" />}>
                <DiffPanel mode="sheet" />
              </Suspense>
            </DiffPanelSheet>
          )}
        </div>
      </div>
    );
  }

  // ── Single thread mode (original behaviour) ─────────────────────
  // Wrap in a drop target so threads can be dragged here to create an initial split
  const singleThreadPane = (
    <SidebarInset
      className="relative h-[var(--app-viewport-height)] min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground"
      onDragOver={(e) => {
        if (
          e.dataTransfer.types.includes("application/t3-thread-id") ||
          e.dataTransfer.types.includes("application/t3-project-id")
        ) {
          e.preventDefault();
          const rect = e.currentTarget.getBoundingClientRect();
          setInitialDropZone(computeClosestDropZone(e.clientX, e.clientY, rect));
        }
      }}
      onDragLeave={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        if (
          e.clientX <= rect.left ||
          e.clientX >= rect.right ||
          e.clientY <= rect.top ||
          e.clientY >= rect.bottom
        ) {
          setInitialDropZone(null);
        }
      }}
      onDrop={(e) => {
        setInitialDropZone(null);
        handleInitialDrop(e);
      }}
    >
      <SplitDropPreview zone={initialDropZone}>
        <ChatView key={threadId} threadId={threadId} onCloseSplitPane={undefined} />
      </SplitDropPreview>
    </SidebarInset>
  );

  if (!shouldUseDiffSheet) {
    return (
      <>
        {singleThreadPane}
        <DiffPanelInlineSidebar
          diffOpen={diffOpen}
          onCloseDiff={closeDiff}
          onOpenDiff={openDiff}
          renderDiffContent={shouldRenderDiffContent}
        />
      </>
    );
  }

  return (
    <>
      {singleThreadPane}
      <DiffPanelSheet diffOpen={diffOpen} onCloseDiff={closeDiff}>
        {shouldRenderDiffContent ? <LazyDiffPanel mode="sheet" /> : null}
      </DiffPanelSheet>
    </>
  );
}

export const Route = createFileRoute("/_chat/$threadId")({
  validateSearch: (search) => parseDiffRouteSearch(search),
  search: {
    middlewares: [retainSearchParams<DiffRouteSearch>(["diff"])],
  },
  component: ChatThreadRouteView,
});
