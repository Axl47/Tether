"use client";

import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useDebouncedValue } from "@tanstack/react-pacer";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ColumnsIcon,
  CornerLeftUpIcon,
  FolderIcon,
  FolderPlusIcon,
  MessageSquareIcon,
  SettingsIcon,
  SquarePenIcon,
} from "lucide-react";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useAppSettings } from "../appSettings";
import { useCommandPaletteStore } from "../commandPaletteStore";
import { useComposerDraftStore } from "../composerDraftStore";
import { useHandleNewThread } from "../hooks/useHandleNewThread";
import {
  startNewLocalThreadFromContext,
  startNewThreadFromContext,
} from "../lib/chatThreadActions";
import {
  appendBrowsePathSegment,
  getBrowseParentPath,
  isExplicitRelativeProjectPath,
  isFilesystemBrowseQuery,
} from "../lib/projectPaths";
import { addProjectFromPath } from "../lib/projectAdd";
import { serverConfigQueryOptions } from "../lib/serverReactQuery";
import {
  openReplaceFocusedCommandPalette,
  openSplitCommandPaletteWithPreview,
} from "../lib/splitPalette";
import { cn, newThreadId } from "../lib/utils";
import { readNativeApi } from "../nativeApi";
import { useSplitViewStore, findLeafByThreadId, type SplitDirection } from "../splitViewStore";
import { useStore } from "../store";
import { DEFAULT_RUNTIME_MODE } from "../types";
import {
  ADDON_ICON_CLASS,
  buildBrowseGroups,
  buildProjectActionItems,
  buildThreadActionItems,
  type CommandPaletteActionItem,
  type CommandPaletteGroup,
  type CommandPaletteSubmenuItem,
  type CommandPaletteView,
  filterCommandPaletteGroups,
  getCommandPaletteInputPlaceholder,
  getCommandPaletteInputStartAddon,
  getCommandPaletteMode,
  ITEM_ICON_CLASS,
  RECENT_THREAD_LIMIT,
} from "./CommandPalette.logic";
import {
  buildPaletteItemGroups,
  paletteItemKey,
  type PaletteItem,
  type PaletteItemGroup,
} from "./commandPaletteGroups";
import { CommandPaletteResults } from "./CommandPaletteResults";
import { Button } from "./ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandGroupLabel,
  CommandDialogPopup,
  CommandFooter,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPanel,
  CommandSeparator,
  useCommandFilteredItems,
} from "./ui/command";
import { Kbd, KbdGroup } from "./ui/kbd";
import { toastManager } from "./ui/toast";

export function CommandPalette({ children }: { children: ReactNode }) {
  const open = useCommandPaletteStore((store) => store.open);
  const setOpen = useCommandPaletteStore((store) => store.setOpen);
  const previewThreadId = useCommandPaletteStore((store) => store.previewThreadId);
  const previewLeafId = useCommandPaletteStore((store) => store.previewLeafId);
  const closePane = useSplitViewStore((store) => store.closePane);
  const clearDraftThread = useComposerDraftStore((store) => store.clearDraftThread);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        setOpen(true);
        return;
      }
      if (previewLeafId && previewThreadId) {
        closePane(previewLeafId);
        clearDraftThread(previewThreadId);
      }
      setOpen(false);
    },
    [clearDraftThread, closePane, previewLeafId, previewThreadId, setOpen],
  );

  return (
    <CommandDialog open={open} onOpenChange={handleOpenChange}>
      {children}
      <CommandPaletteDialog />
    </CommandDialog>
  );
}

function CommandPaletteDialog() {
  const open = useCommandPaletteStore((store) => store.open);
  const mode = useCommandPaletteStore((store) => store.mode);
  const setOpen = useCommandPaletteStore((store) => store.setOpen);

  useEffect(() => {
    return () => {
      setOpen(false);
    };
  }, [setOpen]);

  if (!open) {
    return null;
  }

  if (mode !== "default") {
    return <OpenSplitCommandPaletteDialog />;
  }

  return <OpenCommandPaletteDialog />;
}

function OpenCommandPaletteDialog() {
  const navigate = useNavigate();
  const setOpen = useCommandPaletteStore((store) => store.setOpen);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const isActionsOnly = query.startsWith(">");
  const isBrowsing = isFilesystemBrowseQuery(query);
  const [debouncedBrowsePath] = useDebouncedValue(query, { wait: 200 });
  const [highlightedItemValue, setHighlightedItemValue] = useState<string | null>(null);
  const { settings } = useAppSettings();
  const { activeDraftThread, activeThread, handleNewThread, projects, routeThreadId } =
    useHandleNewThread();
  const threads = useStore((store) => store.threads);
  const serverConfigQuery = useQuery(serverConfigQueryOptions());
  const keybindings = serverConfigQuery.data?.keybindings ?? [];
  const [viewStack, setViewStack] = useState<CommandPaletteView[]>([]);
  const currentView = viewStack.at(-1) ?? null;
  const paletteMode = getCommandPaletteMode({ currentView, isBrowsing });
  const [browseGeneration, setBrowseGeneration] = useState(0);
  const openPalette = useCommandPaletteStore((store) => store.openPalette);
  const splitGroup = useSplitViewStore((store) => store.group);
  const createDraftThread = useComposerDraftStore((store) => store.createDraftThread);
  const splitThreadWithBrowser = useSplitViewStore((store) => store.splitThreadWithBrowser);

  const projectCwdById = useMemo(
    () => new Map(projects.map((project) => [project.id, project.cwd] as const)),
    [projects],
  );
  const projectTitleById = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name] as const)),
    [projects],
  );

  const currentProjectId = activeThread?.projectId ?? activeDraftThread?.projectId ?? null;
  const currentProjectCwd = currentProjectId
    ? (projectCwdById.get(currentProjectId) ?? null)
    : null;
  const splitSourceThreadId = activeThread?.id ?? routeThreadId;
  const relativePathNeedsActiveProject =
    isExplicitRelativeProjectPath(query.trim()) && currentProjectCwd === null;
  const debouncedRelativePathNeedsActiveProject =
    isExplicitRelativeProjectPath(debouncedBrowsePath.trim()) && currentProjectCwd === null;

  const openSplitPalette = useCallback(
    (mode: "split-right" | "split-down") => {
      openSplitCommandPaletteWithPreview({
        mode,
        activeThreadId: splitSourceThreadId,
        previewProjectId: currentProjectId,
        branch: activeThread?.branch ?? null,
        worktreePath: activeThread?.worktreePath ?? null,
        envMode: activeDraftThread?.envMode ?? (activeThread?.worktreePath ? "worktree" : "local"),
        runtimeMode:
          activeDraftThread?.runtimeMode ?? activeThread?.runtimeMode ?? DEFAULT_RUNTIME_MODE,
        interactionMode:
          activeDraftThread?.interactionMode ?? activeThread?.interactionMode ?? "default",
        createDraftThread,
        openCommandPalette: openPalette,
      });
    },
    [
      activeDraftThread?.envMode,
      activeDraftThread?.interactionMode,
      activeDraftThread?.runtimeMode,
      activeThread?.branch,
      activeThread?.interactionMode,
      activeThread?.runtimeMode,
      activeThread?.worktreePath,
      createDraftThread,
      currentProjectId,
      openPalette,
      splitSourceThreadId,
    ],
  );

  const openReplaceFocusedSplitPalette = useCallback(() => {
    openReplaceFocusedCommandPalette({
      activeThreadId: splitSourceThreadId,
      openCommandPalette: openPalette,
    });
  }, [openPalette, splitSourceThreadId]);

  const { data: browseEntries = [] } = useQuery({
    queryKey: ["filesystemBrowse", debouncedBrowsePath, currentProjectCwd],
    queryFn: async () => {
      const api = readNativeApi();
      if (!api) return [];

      const result = await api.filesystem.browse({
        partialPath: debouncedBrowsePath,
        ...(currentProjectCwd ? { cwd: currentProjectCwd } : {}),
      });
      return result.entries;
    },
    enabled:
      isBrowsing && debouncedBrowsePath.length > 0 && !debouncedRelativePathNeedsActiveProject,
  });

  const projectThreadItems = useMemo(
    () =>
      buildProjectActionItems({
        projects,
        valuePrefix: "new-thread-in",
        icon: <FolderIcon className={ITEM_ICON_CLASS} />,
        runProject: async (projectId) => {
          await handleNewThread(projectId, {
            envMode: settings.defaultThreadEnvMode,
          });
        },
      }),
    [handleNewThread, projects, settings.defaultThreadEnvMode],
  );

  const projectLocalThreadItems = useMemo(
    () =>
      buildProjectActionItems({
        projects,
        valuePrefix: "new-local-thread-in",
        icon: <FolderIcon className={ITEM_ICON_CLASS} />,
        runProject: async (projectId) => {
          await handleNewThread(projectId, {
            envMode: "local",
          });
        },
      }),
    [handleNewThread, projects],
  );

  const allThreadItems = useMemo(
    () =>
      buildThreadActionItems({
        threads,
        ...(activeThread?.id ? { activeThreadId: activeThread.id } : {}),
        projectTitleById,
        icon: <MessageSquareIcon className={ITEM_ICON_CLASS} />,
        runThread: async (threadId) => {
          await navigate({
            to: "/$threadId",
            params: { threadId },
          });
        },
      }),
    [activeThread?.id, navigate, projectTitleById, threads],
  );

  const recentThreadItems = useMemo(
    () => allThreadItems.slice(0, RECENT_THREAD_LIMIT),
    [allThreadItems],
  );

  const pushView = useCallback((item: CommandPaletteSubmenuItem) => {
    setViewStack((previousViews) => [
      ...previousViews,
      {
        addonIcon: item.addonIcon,
        groups: item.groups,
        ...(item.initialQuery ? { initialQuery: item.initialQuery } : {}),
      },
    ]);
    setHighlightedItemValue(null);
    setQuery(item.initialQuery ?? "");
  }, []);

  const popView = useCallback(() => {
    setViewStack((previousViews) => previousViews.slice(0, -1));
    setHighlightedItemValue(null);
    setQuery("");
  }, []);

  const handleQueryChange = useCallback(
    (nextQuery: string) => {
      setHighlightedItemValue(null);
      setQuery(nextQuery);
      if (nextQuery === "" && currentView?.initialQuery) {
        popView();
      }
    },
    [currentView, popView],
  );

  const rootGroups = useMemo<CommandPaletteGroup[]>(() => {
    const actionItems: Array<CommandPaletteActionItem | CommandPaletteSubmenuItem> = [];

    if (projects.length > 0) {
      const activeProjectTitle = currentProjectId
        ? (projectTitleById.get(currentProjectId) ?? null)
        : null;

      if (activeProjectTitle) {
        actionItems.push({
          kind: "action",
          value: "action:new-thread",
          label: `new thread chat create ${activeProjectTitle}`.trim(),
          title: (
            <>
              New thread in <span className="font-semibold">{activeProjectTitle}</span>
            </>
          ),
          searchText: "new thread chat create draft",
          icon: <SquarePenIcon className={ITEM_ICON_CLASS} />,
          shortcutCommand: "chat.new",
          run: async () => {
            await startNewThreadFromContext({
              activeDraftThread,
              activeThread,
              defaultThreadEnvMode: settings.defaultThreadEnvMode,
              handleNewThread,
              projects,
            });
          },
        });

        actionItems.push({
          kind: "action",
          value: "action:new-local-thread",
          label: `new fresh thread chat create ${activeProjectTitle}`.trim(),
          title: (
            <>
              New fresh thread in <span className="font-semibold">{activeProjectTitle}</span>
            </>
          ),
          searchText: "new local thread chat create fresh default environment",
          icon: <SquarePenIcon className={ITEM_ICON_CLASS} />,
          shortcutCommand: "chat.newLocal",
          run: async () => {
            await startNewLocalThreadFromContext({
              activeDraftThread,
              activeThread,
              defaultThreadEnvMode: settings.defaultThreadEnvMode,
              handleNewThread,
              projects,
            });
          },
        });
      }

      actionItems.push({
        kind: "submenu",
        value: "action:new-thread-in",
        label: "new thread in project",
        title: "New thread in...",
        searchText: "new thread project pick choose select",
        icon: <SquarePenIcon className={ITEM_ICON_CLASS} />,
        addonIcon: <SquarePenIcon className={ADDON_ICON_CLASS} />,
        groups: [{ value: "projects", label: "Projects", items: projectThreadItems }],
      });

      actionItems.push({
        kind: "submenu",
        value: "action:new-local-thread-in",
        label: "new local thread in project",
        title: "New local thread in...",
        searchText: "new local thread project pick choose select fresh default environment",
        icon: <SquarePenIcon className={ITEM_ICON_CLASS} />,
        addonIcon: <SquarePenIcon className={ADDON_ICON_CLASS} />,
        groups: [{ value: "projects", label: "Projects", items: projectLocalThreadItems }],
      });
    }

    actionItems.push({
      kind: "submenu",
      value: "action:add-project",
      label: "add project folder directory browse",
      title: "Add project",
      icon: <FolderPlusIcon className={ITEM_ICON_CLASS} />,
      addonIcon: <FolderPlusIcon className={ADDON_ICON_CLASS} />,
      groups: [],
      initialQuery: "~/",
    });

    actionItems.push({
      kind: "action",
      value: "action:settings",
      label: "settings preferences configuration keybindings",
      title: "Open settings",
      icon: <SettingsIcon className={ITEM_ICON_CLASS} />,
      run: async () => {
        await navigate({ to: "/settings" });
      },
    });

    if (splitSourceThreadId && window.desktopBridge) {
      actionItems.push({
        kind: "action",
        value: "action:browser-right",
        label: "open browser right pane desktop",
        title: "Open browser right",
        searchText: "open browser right split page panel desktop",
        icon: <ColumnsIcon className={ITEM_ICON_CLASS} />,
        keepOpen: false,
        run: async () => {
          splitThreadWithBrowser(splitSourceThreadId, "horizontal");
        },
      });
      actionItems.push({
        kind: "action",
        value: "action:browser-down",
        label: "open browser down pane desktop",
        title: "Open browser down",
        searchText: "open browser down split page panel desktop",
        icon: <ColumnsIcon className={ITEM_ICON_CLASS} />,
        keepOpen: false,
        run: async () => {
          splitThreadWithBrowser(splitSourceThreadId, "vertical");
        },
      });
    }

    if (splitSourceThreadId) {
      actionItems.push({
        kind: "action",
        value: "action:split-right",
        label: "split right pane column workspace",
        title: "Split right",
        searchText: "split right pane column side by side workspace",
        icon: <ColumnsIcon className={ITEM_ICON_CLASS} />,
        shortcutCommand: "chat.splitRight",
        keepOpen: true,
        run: async () => {
          openSplitPalette("split-right");
        },
      });

      actionItems.push({
        kind: "action",
        value: "action:split-down",
        label: "split down pane row workspace",
        title: "Split down",
        searchText: "split down pane row stacked workspace",
        icon: <ColumnsIcon className={ITEM_ICON_CLASS} />,
        shortcutCommand: "chat.splitDown",
        keepOpen: true,
        run: async () => {
          openSplitPalette("split-down");
        },
      });
    }

    if (splitGroup && splitSourceThreadId) {
      actionItems.push({
        kind: "action",
        value: "action:replace-focused-pane",
        label: "replace focused pane split workspace",
        title: "Replace focused pane",
        searchText: "replace focused pane split workspace",
        icon: <ColumnsIcon className={ITEM_ICON_CLASS} />,
        shortcutCommand: "chat.replaceFocusedPane",
        keepOpen: true,
        run: async () => {
          openReplaceFocusedSplitPalette();
        },
      });
    }

    const groups: CommandPaletteGroup[] = [];
    if (actionItems.length > 0) {
      groups.push({
        value: "actions",
        label: "Actions",
        items: actionItems,
      });
    }
    if (recentThreadItems.length > 0) {
      groups.push({
        value: "recent-threads",
        label: "Recent Threads",
        items: recentThreadItems,
      });
    }
    return groups;
  }, [
    activeDraftThread,
    activeThread,
    currentProjectId,
    handleNewThread,
    navigate,
    projectLocalThreadItems,
    projectThreadItems,
    projectTitleById,
    projects,
    recentThreadItems,
    settings.defaultThreadEnvMode,
    splitGroup,
    splitSourceThreadId,
    splitThreadWithBrowser,
    openReplaceFocusedSplitPalette,
    openSplitPalette,
  ]);

  const activeGroups = currentView ? currentView.groups : rootGroups;

  const filteredGroups = useMemo(
    () =>
      filterCommandPaletteGroups({
        activeGroups,
        query: deferredQuery,
        isInSubmenu: currentView !== null,
        projectSearchItems: projectThreadItems,
        threadSearchItems: allThreadItems,
      }),
    [activeGroups, allThreadItems, currentView, deferredQuery, projectThreadItems],
  );

  const handleAddProject = useCallback(
    async (rawCwd: string) => {
      const api = readNativeApi();
      if (!api) return;

      try {
        await addProjectFromPath(
          {
            api,
            currentProjectCwd,
            defaultThreadEnvMode: settings.defaultThreadEnvMode,
            handleNewThread,
            navigateToThread: async (threadId) => {
              await navigate({
                to: "/$threadId",
                params: { threadId },
              });
            },
            platform: navigator.platform,
            projects,
            threads,
          },
          rawCwd,
        );
        setOpen(false);
      } catch (error) {
        toastManager.add({
          type: "error",
          title: "Failed to add project",
          description: error instanceof Error ? error.message : "An error occurred.",
        });
      }
    },
    [
      currentProjectCwd,
      handleNewThread,
      navigate,
      projects,
      setOpen,
      settings.defaultThreadEnvMode,
      threads,
    ],
  );

  const browseTo = useCallback(
    (name: string) => {
      setHighlightedItemValue(null);
      setQuery(appendBrowsePathSegment(query, name));
      setBrowseGeneration((generation) => generation + 1);
    },
    [query],
  );

  const browseUp = useCallback(() => {
    const parentPath = getBrowseParentPath(query);
    if (parentPath === null) {
      return;
    }

    setHighlightedItemValue(null);
    setQuery(parentPath);
    setBrowseGeneration((generation) => generation + 1);
  }, [query]);

  const canBrowseUp =
    isBrowsing && !relativePathNeedsActiveProject && getBrowseParentPath(query) !== null;

  const browseGroups = useMemo(
    () =>
      buildBrowseGroups({
        browseEntries,
        browseQuery: query,
        canBrowseUp,
        upIcon: <CornerLeftUpIcon className={ITEM_ICON_CLASS} />,
        directoryIcon: <FolderIcon className={ITEM_ICON_CLASS} />,
        browseUp,
        browseTo,
      }),
    [browseEntries, browseTo, browseUp, canBrowseUp, query],
  );

  const displayedGroups = useMemo(
    () =>
      isBrowsing && relativePathNeedsActiveProject
        ? []
        : isBrowsing
          ? browseGroups
          : filteredGroups,
    [browseGroups, filteredGroups, isBrowsing, relativePathNeedsActiveProject],
  );
  const inputPlaceholder = getCommandPaletteInputPlaceholder(paletteMode);
  const inputStartAddon = getCommandPaletteInputStartAddon({
    mode: paletteMode,
    currentViewAddonIcon: currentView?.addonIcon ?? null,
    browseIcon: <FolderPlusIcon />,
  });
  const isSubmenu = paletteMode === "submenu" || paletteMode === "submenu-browse";

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (
        isBrowsing &&
        event.key === "Enter" &&
        highlightedItemValue === null &&
        !relativePathNeedsActiveProject
      ) {
        event.preventDefault();
        void handleAddProject(query.trim());
      }

      if (event.key === "Backspace" && query === "" && isSubmenu) {
        event.preventDefault();
        popView();
      }
    },
    [
      handleAddProject,
      highlightedItemValue,
      isBrowsing,
      isSubmenu,
      popView,
      query,
      relativePathNeedsActiveProject,
    ],
  );

  const executeItem = useCallback(
    (item: CommandPaletteActionItem | CommandPaletteSubmenuItem) => {
      if (item.kind === "submenu") {
        pushView(item);
        return;
      }

      if (!item.keepOpen) {
        setOpen(false);
      }

      void item.run().catch((error: unknown) => {
        toastManager.add({
          type: "error",
          title: "Unable to run command",
          description: error instanceof Error ? error.message : "An unexpected error occurred.",
        });
      });
    },
    [pushView, setOpen],
  );

  return (
    <CommandDialogPopup
      aria-label="Command palette"
      className="overflow-hidden p-0"
      data-testid="command-palette"
    >
      <Command
        key={`${viewStack.length}-${browseGeneration}`}
        aria-label="Command palette"
        autoHighlight={isBrowsing ? false : "always"}
        mode="none"
        onItemHighlighted={(value) => {
          setHighlightedItemValue(typeof value === "string" ? value : null);
        }}
        onValueChange={handleQueryChange}
        value={query}
      >
        <div className="relative">
          <CommandInput
            className={isBrowsing ? "pe-16" : undefined}
            placeholder={inputPlaceholder}
            startAddon={inputStartAddon}
            onKeyDown={handleKeyDown}
          />
          {isBrowsing ? (
            <Button
              variant="outline"
              size="xs"
              tabIndex={-1}
              className="absolute end-2.5 top-1/2 -translate-y-1/2"
              disabled={relativePathNeedsActiveProject}
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              onClick={() => {
                if (relativePathNeedsActiveProject) {
                  return;
                }
                void handleAddProject(query.trim());
              }}
            >
              Add
            </Button>
          ) : null}
        </div>
        <CommandPanel className="max-h-[min(28rem,70vh)]">
          <CommandPaletteResults
            groups={displayedGroups}
            isActionsOnly={isActionsOnly}
            keybindings={keybindings}
            onExecuteItem={executeItem}
            {...(relativePathNeedsActiveProject
              ? { emptyStateMessage: "Relative paths require an active project." }
              : {})}
          />
        </CommandPanel>
        <CommandFooter className="gap-3 max-sm:flex-col max-sm:items-start">
          <div className="flex items-center gap-3">
            <KbdGroup className="items-center gap-1.5">
              <Kbd>
                <ArrowUpIcon />
              </Kbd>
              <Kbd>
                <ArrowDownIcon />
              </Kbd>
              <span className={cn("text-muted-foreground/80")}>Navigate</span>
            </KbdGroup>
            <KbdGroup className="items-center gap-1.5">
              <Kbd>Enter</Kbd>
              <span className={cn("text-muted-foreground/80")}>Select</span>
            </KbdGroup>
            {isSubmenu ? (
              <KbdGroup className="items-center gap-1.5">
                <Kbd>Backspace</Kbd>
                <span className={cn("text-muted-foreground/80")}>Back</span>
              </KbdGroup>
            ) : null}
            <KbdGroup className="items-center gap-1.5">
              <Kbd>Esc</Kbd>
              <span className={cn("text-muted-foreground/80")}>Close</span>
            </KbdGroup>
          </div>
        </CommandFooter>
      </Command>
    </CommandDialogPopup>
  );
}

function splitPalettePlaceholder(
  mode: ReturnType<typeof useCommandPaletteStore.getState>["mode"],
): string {
  switch (mode) {
    case "split-right":
      return "Split right with a thread or project...";
    case "split-down":
      return "Split down with a thread or project...";
    case "replace-focused":
      return "Replace the focused pane with a thread or project...";
    default:
      return "Search...";
  }
}

function splitPaletteItemSearchText(item: PaletteItem): string {
  switch (item.kind) {
    case "new-thread":
      return `new thread ${item.project.name} ${item.project.cwd}`;
    case "workspace":
      return `workspace ${item.name} ${item.threadCount}`;
    case "thread":
      return `${item.thread.title} ${item.project?.name ?? ""} ${item.project?.cwd ?? ""}`;
    default:
      return item.kind;
  }
}

function OpenSplitCommandPaletteDialog() {
  const navigate = useNavigate();
  const { settings } = useAppSettings();
  const paletteMode = useCommandPaletteStore((store) => store.mode);
  const sourceThreadId = useCommandPaletteStore((store) => store.sourceThreadId);
  const sourceLeafId = useCommandPaletteStore((store) => store.sourceLeafId);
  const previewThreadId = useCommandPaletteStore((store) => store.previewThreadId);
  const previewLeafId = useCommandPaletteStore((store) => store.previewLeafId);
  const closePaletteStore = useCommandPaletteStore((store) => store.closePalette);
  const [query, setQuery] = useState("");
  const highlightedItemRef = useRef<PaletteItem | null>(null);

  const projects = useStore((store) => store.projects);
  const threads = useStore((store) => store.threads);
  const splitGroup = useSplitViewStore((store) => store.group);
  const workspaces = useSplitViewStore((store) => store.workspaces);
  const activeWorkspaceId = useSplitViewStore((store) => store.activeWorkspaceId);
  const activateWorkspace = useSplitViewStore((store) => store.activateWorkspace);
  const deactivateWorkspace = useSplitViewStore((store) => store.deactivateWorkspace);
  const splitThread = useSplitViewStore((store) => store.splitThread);
  const splitLeaf = useSplitViewStore((store) => store.splitLeaf);
  const replaceThreadInLeaf = useSplitViewStore((store) => store.replaceThreadInLeaf);
  const replaceThreadInFocusedLeaf = useSplitViewStore((store) => store.replaceThreadInFocusedLeaf);
  const setFocusedLeaf = useSplitViewStore((store) => store.setFocusedLeaf);
  const closePane = useSplitViewStore((store) => store.closePane);

  const getDraftThread = useComposerDraftStore((store) => store.getDraftThread);
  const getDraftThreadByProjectId = useComposerDraftStore(
    (store) => store.getDraftThreadByProjectId,
  );
  const setProjectDraftThreadId = useComposerDraftStore((store) => store.setProjectDraftThreadId);
  const clearDraftThread = useComposerDraftStore((store) => store.clearDraftThread);
  const clearProjectDraftThreadId = useComposerDraftStore(
    (store) => store.clearProjectDraftThreadId,
  );
  const projectDraftThreadIdByProjectId = useComposerDraftStore(
    (store) => store.projectDraftThreadIdByProjectId,
  );

  const itemGroups = useMemo(
    () =>
      buildPaletteItemGroups({
        paletteMode,
        projects,
        threads,
        workspaces,
        routeThreadId: sourceThreadId,
        activeWorkspaceId,
        splitGroup,
        projectDraftThreadIdByProjectId,
      }),
    [
      activeWorkspaceId,
      paletteMode,
      projectDraftThreadIdByProjectId,
      projects,
      sourceThreadId,
      splitGroup,
      threads,
      workspaces,
    ],
  );

  const resetSplitPalette = useCallback(() => {
    closePaletteStore();
    setQuery("");
    highlightedItemRef.current = null;
  }, [closePaletteStore, highlightedItemRef]);

  const closeSplitPalette = useCallback(() => {
    if (previewLeafId && previewThreadId) {
      closePane(previewLeafId);
      clearDraftThread(previewThreadId);
    }
    resetSplitPalette();
  }, [clearDraftThread, closePane, previewLeafId, previewThreadId, resetSplitPalette]);

  const splitDirection = useMemo<SplitDirection | null>(() => {
    switch (paletteMode) {
      case "split-right":
        return "horizontal";
      case "split-down":
        return "vertical";
      default:
        return null;
    }
  }, [paletteMode]);

  const activateSplitThread = useCallback(
    (threadId: string) => {
      const existingWorkspace = workspaces.find((workspace) =>
        findLeafByThreadId(workspace.root, threadId as never),
      );
      if (existingWorkspace) {
        const leaf = findLeafByThreadId(existingWorkspace.root, threadId as never);
        if (previewLeafId && previewThreadId && previewThreadId !== threadId) {
          closePane(previewLeafId);
          clearDraftThread(previewThreadId);
        }
        resetSplitPalette();
        activateWorkspace(existingWorkspace.id);
        if (leaf) {
          setFocusedLeaf(leaf.id);
        }
        void navigate({
          to: "/$threadId",
          params: { threadId },
        });
        return;
      }

      if (previewLeafId && previewThreadId) {
        replaceThreadInLeaf(previewLeafId, threadId as never);
        if (previewThreadId !== threadId) {
          clearDraftThread(previewThreadId);
        }
        resetSplitPalette();
        void navigate({
          to: "/$threadId",
          params: { threadId },
        });
        return;
      }

      if (splitDirection && sourceThreadId) {
        if (splitGroup && sourceLeafId) {
          const existingLeaf = findLeafByThreadId(splitGroup.root, threadId as never);
          if (existingLeaf) {
            setFocusedLeaf(existingLeaf.id);
          } else {
            splitLeaf(sourceLeafId, threadId as never, splitDirection, false);
          }
        } else {
          splitThread(sourceThreadId, threadId as never, splitDirection, false);
        }
        resetSplitPalette();
        void navigate({
          to: "/$threadId",
          params: { threadId },
        });
        return;
      }

      if (paletteMode === "replace-focused" && splitGroup) {
        const existingLeaf = findLeafByThreadId(splitGroup.root, threadId as never);
        if (existingLeaf) {
          setFocusedLeaf(existingLeaf.id);
        } else {
          replaceThreadInFocusedLeaf(threadId as never);
        }
        resetSplitPalette();
        void navigate({
          to: "/$threadId",
          params: { threadId },
        });
        return;
      }

      deactivateWorkspace();
      resetSplitPalette();
      void navigate({
        to: "/$threadId",
        params: { threadId },
      });
    },
    [
      activateWorkspace,
      clearDraftThread,
      closePane,
      deactivateWorkspace,
      navigate,
      paletteMode,
      previewLeafId,
      previewThreadId,
      replaceThreadInFocusedLeaf,
      replaceThreadInLeaf,
      resetSplitPalette,
      setFocusedLeaf,
      sourceLeafId,
      sourceThreadId,
      splitDirection,
      splitGroup,
      splitLeaf,
      splitThread,
      workspaces,
    ],
  );

  const handleSelectProject = useCallback(
    (projectId: string) => {
      const existingDraft = getDraftThreadByProjectId(projectId as never);
      const targetThreadId = previewThreadId ?? existingDraft?.threadId ?? newThreadId();

      if (previewThreadId) {
        const previewDraft = getDraftThread(previewThreadId);
        setProjectDraftThreadId(projectId as never, previewThreadId, {
          createdAt: previewDraft?.createdAt ?? new Date().toISOString(),
          branch: previewDraft?.branch ?? null,
          worktreePath: previewDraft?.worktreePath ?? null,
          envMode: previewDraft?.envMode ?? settings.defaultThreadEnvMode,
          runtimeMode: previewDraft?.runtimeMode ?? DEFAULT_RUNTIME_MODE,
          interactionMode: previewDraft?.interactionMode ?? "default",
        });
      } else if (!existingDraft) {
        clearProjectDraftThreadId(projectId as never);
        setProjectDraftThreadId(projectId as never, targetThreadId, {
          createdAt: new Date().toISOString(),
          branch: null,
          worktreePath: null,
          envMode: settings.defaultThreadEnvMode,
          runtimeMode: DEFAULT_RUNTIME_MODE,
        });
      } else {
        setProjectDraftThreadId(projectId as never, existingDraft.threadId);
      }

      activateSplitThread(targetThreadId);
    },
    [
      activateSplitThread,
      clearProjectDraftThreadId,
      getDraftThread,
      getDraftThreadByProjectId,
      previewThreadId,
      setProjectDraftThreadId,
      settings.defaultThreadEnvMode,
    ],
  );

  const handleItemClick = useCallback(
    (item: PaletteItem) => {
      switch (item.kind) {
        case "new-thread":
          handleSelectProject(item.project.id);
          return;
        case "workspace": {
          resetSplitPalette();
          const focusedThreadId = activateWorkspace(item.workspaceId);
          if (!focusedThreadId) {
            return;
          }
          void navigate({
            to: "/$threadId",
            params: { threadId: focusedThreadId },
          });
          return;
        }
        case "thread":
          activateSplitThread(item.thread.id);
          return;
        default:
          return;
      }
    },
    [activateSplitThread, activateWorkspace, handleSelectProject, navigate, resetSplitPalette],
  );

  return (
    <CommandDialogPopup
      aria-label="Split command palette"
      className="overflow-hidden p-0"
      data-testid="command-palette"
    >
      <Command
        items={itemGroups}
        value={query}
        onValueChange={setQuery}
        itemToStringValue={(item) => (item ? splitPaletteItemSearchText(item as PaletteItem) : "")}
        onItemHighlighted={(item) => {
          highlightedItemRef.current = item ? (item as PaletteItem) : null;
        }}
      >
        <CommandInput placeholder={splitPalettePlaceholder(paletteMode)} />
        <CommandPanel
          className="max-h-[min(28rem,70vh)]"
          onKeyDownCapture={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              closeSplitPalette();
              return;
            }
            if (event.key !== "Enter" || !highlightedItemRef.current) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            handleItemClick(highlightedItemRef.current);
          }}
        >
          <SplitCommandPaletteResults onItemClick={handleItemClick} />
        </CommandPanel>
        <CommandFooter className="gap-3 max-sm:flex-col max-sm:items-start">
          <div className="flex items-center gap-3">
            <KbdGroup className="items-center gap-1.5">
              <Kbd>
                <ArrowUpIcon />
              </Kbd>
              <Kbd>
                <ArrowDownIcon />
              </Kbd>
              <span className={cn("text-muted-foreground/80")}>Navigate</span>
            </KbdGroup>
            <KbdGroup className="items-center gap-1.5">
              <Kbd>Enter</Kbd>
              <span className={cn("text-muted-foreground/80")}>
                {paletteMode === "replace-focused" ? "Replace" : "Split"}
              </span>
            </KbdGroup>
            <KbdGroup className="items-center gap-1.5">
              <Kbd>Esc</Kbd>
              <span className={cn("text-muted-foreground/80")}>Cancel</span>
            </KbdGroup>
          </div>
        </CommandFooter>
      </Command>
    </CommandDialogPopup>
  );
}

function SplitCommandPaletteResults(props: { onItemClick: (item: PaletteItem) => void }) {
  const filteredItemGroups = useCommandFilteredItems<PaletteItemGroup>();
  const visibleGroups = filteredItemGroups.filter((group) => group.items.length > 0);

  return (
    <CommandList>
      <CommandEmpty>No results found.</CommandEmpty>
      {visibleGroups.map((group) => (
        <CommandGroup key={group.label}>
          <CommandGroupLabel>{group.label}</CommandGroupLabel>
          {group.items.map((item) => (
            <CommandItem
              key={`${group.label}:${paletteItemKey(item)}`}
              value={item}
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              onClick={() => props.onItemClick(item)}
            >
              <SplitPaletteItemContent item={item} />
            </CommandItem>
          ))}
          <CommandSeparator />
        </CommandGroup>
      ))}
    </CommandList>
  );
}

function SplitPaletteItemContent({ item }: { item: PaletteItem }) {
  switch (item.kind) {
    case "new-thread":
      return (
        <>
          <SquarePenIcon className="mr-2 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="truncate">New thread in {item.project.name}</div>
            <div className="truncate text-xs text-muted-foreground">{item.project.cwd}</div>
          </div>
        </>
      );
    case "workspace":
      return (
        <>
          <FolderIcon className="mr-2 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="truncate">{item.name}</div>
            <div className="truncate text-xs text-muted-foreground">
              {item.threadCount} thread{item.threadCount === 1 ? "" : "s"}
            </div>
          </div>
        </>
      );
    case "thread":
      return (
        <>
          <MessageSquareIcon className="mr-2 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="truncate">{item.thread.title}</div>
            <div className="truncate text-xs text-muted-foreground">
              {item.project?.name ?? "Unknown project"}
            </div>
          </div>
        </>
      );
    default:
      return <div className="truncate">{item.kind}</div>;
  }
}
