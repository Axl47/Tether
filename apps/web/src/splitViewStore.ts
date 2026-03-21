import { ThreadId } from "@t3tools/contracts";
import { create } from "zustand";
import { Debouncer } from "@tanstack/react-pacer";

export type SplitDirection = "horizontal" | "vertical";

export interface ThreadPaneLeaf {
  readonly type: "leaf";
  readonly id: string;
  readonly paneType: "thread";
  readonly threadId: ThreadId;
}

export interface BrowserPaneLeaf {
  readonly type: "leaf";
  readonly id: string;
  readonly paneType: "browser";
  readonly paneId: string;
  readonly url: string;
  readonly targetThreadId: ThreadId;
  readonly createdFromThreadId: ThreadId;
}

export type SplitLeaf = ThreadPaneLeaf | BrowserPaneLeaf;

export interface SplitBranch {
  readonly type: "branch";
  readonly id: string;
  readonly direction: SplitDirection;
  readonly children: readonly [SplitNode, SplitNode];
  readonly ratio: number;
}

export type SplitNode = SplitLeaf | SplitBranch;

export interface Workspace {
  readonly id: string;
  readonly name: string;
  readonly lastVisitedAt?: string;
  readonly root: SplitNode;
  readonly focusedLeafId: string;
}

export type SplitGroup = Workspace;
export type PersistedBrowserPaneState = Pick<BrowserPaneLeaf, "paneId" | "url" | "targetThreadId" | "createdFromThreadId">;

let _nextId = 0;
export function splitNodeId(): string {
  return `split_${Date.now().toString(36)}_${(++_nextId).toString(36)}`;
}

export function createThreadLeaf(threadId: ThreadId): ThreadPaneLeaf {
  return { type: "leaf", id: splitNodeId(), paneType: "thread", threadId };
}

export function createBrowserLeaf(state: PersistedBrowserPaneState): BrowserPaneLeaf {
  return { type: "leaf", id: splitNodeId(), paneType: "browser", ...state };
}

export function collectThreadIds(node: SplitNode): ThreadId[] {
  if (node.type === "leaf") return node.paneType === "thread" ? [node.threadId] : [];
  return [...collectThreadIds(node.children[0]), ...collectThreadIds(node.children[1])];
}

export function countLeaves(node: SplitNode): number {
  if (node.type === "leaf") return 1;
  return countLeaves(node.children[0]) + countLeaves(node.children[1]);
}

export function findLeaf(node: SplitNode, leafId: string): SplitLeaf | null {
  if (node.type === "leaf") return node.id === leafId ? node : null;
  return findLeaf(node.children[0], leafId) ?? findLeaf(node.children[1], leafId);
}

export function findLeafByThreadId(node: SplitNode, threadId: ThreadId): ThreadPaneLeaf | null {
  if (node.type === "leaf") {
    return node.paneType === "thread" && node.threadId === threadId ? node : null;
  }
  return findLeafByThreadId(node.children[0], threadId) ?? findLeafByThreadId(node.children[1], threadId);
}

export function findBrowserLeafByPaneId(node: SplitNode, paneId: string): BrowserPaneLeaf | null {
  if (node.type === "leaf") {
    return node.paneType === "browser" && node.paneId === paneId ? node : null;
  }
  return findBrowserLeafByPaneId(node.children[0], paneId) ?? findBrowserLeafByPaneId(node.children[1], paneId);
}

export function firstLeaf(node: SplitNode): SplitLeaf {
  if (node.type === "leaf") return node;
  return firstLeaf(node.children[0]);
}

export type FocusDirection = "up" | "down" | "left" | "right";
export type DropZone = "top" | "bottom" | "left" | "right" | "center";

function replaceLeaf(node: SplitNode, leafId: string, replacement: SplitLeaf): SplitNode | null {
  if (node.type === "leaf") return node.id === leafId ? replacement : null;
  const left = replaceLeaf(node.children[0], leafId, replacement);
  if (left) return { ...node, children: [left, node.children[1]] };
  const right = replaceLeaf(node.children[1], leafId, replacement);
  if (right) return { ...node, children: [node.children[0], right] };
  return null;
}

function splitLeafNode(
  node: SplitNode,
  targetLeafId: string,
  newLeaf: SplitLeaf,
  direction: SplitDirection,
  insertBefore: boolean,
): SplitNode | null {
  if (node.type === "leaf") {
    if (node.id !== targetLeafId) return null;
    const first = insertBefore ? newLeaf : node;
    const second = insertBefore ? node : newLeaf;
    return { type: "branch", id: splitNodeId(), direction, children: [first, second], ratio: 0.5 };
  }
  const left = splitLeafNode(node.children[0], targetLeafId, newLeaf, direction, insertBefore);
  if (left) return { ...node, children: [left, node.children[1]] };
  const right = splitLeafNode(node.children[1], targetLeafId, newLeaf, direction, insertBefore);
  if (right) return { ...node, children: [node.children[0], right] };
  return null;
}

function removeLeaf(node: SplitNode, leafId: string): SplitNode | null {
  if (node.type === "leaf") return node.id === leafId ? null : node;
  const left = removeLeaf(node.children[0], leafId);
  const right = removeLeaf(node.children[1], leafId);
  if (left === node.children[0] && right === node.children[1]) return node;
  if (left === null) return right;
  if (right === null) return left;
  return { ...node, children: [left, right] };
}

function updateBranchRatio(node: SplitNode, branchId: string, ratio: number): SplitNode | null {
  if (node.type === "leaf") return null;
  if (node.id === branchId) return { ...node, ratio: Math.max(0.1, Math.min(0.9, ratio)) };
  const left = updateBranchRatio(node.children[0], branchId, ratio);
  if (left) return { ...node, children: [left, node.children[1]] };
  const right = updateBranchRatio(node.children[1], branchId, ratio);
  if (right) return { ...node, children: [node.children[0], right] };
  return null;
}

function hasThreadLeaf(node: SplitNode): boolean {
  if (node.type === "leaf") return node.paneType === "thread";
  return hasThreadLeaf(node.children[0]) || hasThreadLeaf(node.children[1]);
}

function pruneInvalidLeaves(node: SplitNode, validThreadIds: ReadonlySet<ThreadId>, allowBrowser: boolean): SplitNode | null {
  if (node.type === "leaf") {
    if (node.paneType === "thread") return validThreadIds.has(node.threadId) ? node : null;
    return allowBrowser ? node : null;
  }
  const left = pruneInvalidLeaves(node.children[0], validThreadIds, allowBrowser);
  const right = pruneInvalidLeaves(node.children[1], validThreadIds, allowBrowser);
  if (left === null) return right;
  if (right === null) return left;
  if (left === node.children[0] && right === node.children[1]) return node;
  return { ...node, children: [left, right] };
}

function updateBrowserLeafState(node: SplitNode, paneId: string, state: Partial<PersistedBrowserPaneState>): SplitNode | null {
  if (node.type === "leaf") {
    if (node.paneType !== "browser" || node.paneId !== paneId) return null;
    return { ...node, ...state };
  }
  const left = updateBrowserLeafState(node.children[0], paneId, state);
  if (left) return { ...node, children: [left, node.children[1]] };
  const right = updateBrowserLeafState(node.children[1], paneId, state);
  if (right) return { ...node, children: [node.children[0], right] };
  return null;
}

function computeLeafRects(node: SplitNode, x = 0, y = 0, w = 1, h = 1): Map<string, { x: number; y: number; w: number; h: number }> {
  if (node.type === "leaf") return new Map([[node.id, { x, y, w, h }]]);
  if (node.direction === "horizontal") {
    const leftW = w * node.ratio;
    return new Map([
      ...computeLeafRects(node.children[0], x, y, leftW, h),
      ...computeLeafRects(node.children[1], x + leftW, y, w * (1 - node.ratio), h),
    ]);
  }
  const topH = h * node.ratio;
  return new Map([
    ...computeLeafRects(node.children[0], x, y, w, topH),
    ...computeLeafRects(node.children[1], x, y + topH, w, h * (1 - node.ratio)),
  ]);
}

export function findLeafInDirection(root: SplitNode, currentLeafId: string, direction: FocusDirection): SplitLeaf | null {
  const rects = computeLeafRects(root);
  const cur = rects.get(currentLeafId);
  if (!cur) return null;
  const isVertical = direction === "up" || direction === "down";
  let bestId: string | null = null;
  let bestOverlaps = false;
  let bestPrimary = Infinity;
  for (const [id, rect] of rects) {
    if (id === currentLeafId) continue;
    let inDirection = false;
    let primaryDist = 0;
    if (isVertical) {
      if (direction === "down") {
        inDirection = rect.y + rect.h > cur.y + cur.h;
        primaryDist = Math.max(0, rect.y - (cur.y + cur.h));
      } else {
        inDirection = rect.y < cur.y;
        primaryDist = Math.max(0, cur.y - (rect.y + rect.h));
      }
    } else if (direction === "right") {
      inDirection = rect.x + rect.w > cur.x + cur.w;
      primaryDist = Math.max(0, rect.x - (cur.x + cur.w));
    } else {
      inDirection = rect.x < cur.x;
      primaryDist = Math.max(0, cur.x - (rect.x + rect.w));
    }
    if (!inDirection) continue;
    const overlaps = isVertical
      ? rect.x < cur.x + cur.w - 0.001 && rect.x + rect.w > cur.x + 0.001
      : rect.y < cur.y + cur.h - 0.001 && rect.y + rect.h > cur.y + 0.001;
    if ((overlaps && !bestOverlaps) || (overlaps === bestOverlaps && primaryDist < bestPrimary)) {
      bestId = id;
      bestOverlaps = overlaps;
      bestPrimary = primaryDist;
    }
  }
  return bestId ? findLeaf(root, bestId) : null;
}

interface SplitRect { left: number; top: number; width: number; height: number }
export function computeClosestDropZone(clientX: number, clientY: number, rect: SplitRect): DropZone {
  const relX = (clientX - rect.left) / rect.width;
  const relY = (clientY - rect.top) / rect.height;
  if (relX > 0.24 && relX < 0.76 && relY > 0.24 && relY < 0.76) return "center";
  const minDist = Math.min(relX, 1 - relX, relY, 1 - relY);
  if (minDist === relY) return "top";
  if (minDist === 1 - relY) return "bottom";
  if (minDist === relX) return "left";
  return "right";
}

export function dropZoneToSplit(zone: Exclude<DropZone, "center">): { direction: SplitDirection; insertBefore: boolean } {
  switch (zone) {
    case "top": return { direction: "vertical", insertBefore: true };
    case "bottom": return { direction: "vertical", insertBefore: false };
    case "left": return { direction: "horizontal", insertBefore: true };
    case "right": return { direction: "horizontal", insertBefore: false };
  }
}

const SPLIT_VIEW_STORAGE_KEY = "t3code:workspaces:v2";
const LEGACY_SPLIT_VIEW_STORAGE_KEY = "t3code:workspaces:v1";
const LEGACY_SINGLE_SPLIT_VIEW_STORAGE_KEY = "t3code:split-view:v1";

interface PersistedSplitViewState { workspaces: Workspace[]; activeWorkspaceId: string | null }
interface LegacyPersistedSplitViewState { group: SplitGroup | null }

function isDesktopMode(): boolean {
  return typeof window !== "undefined" && window.desktopBridge !== undefined;
}

function isValidLeaf(leaf: unknown): leaf is SplitLeaf {
  if (!leaf || typeof leaf !== "object") return false;
  const c = leaf as Record<string, unknown>;
  if (c.type !== "leaf" || typeof c.id !== "string") return false;
  if (c.paneType === "thread") return typeof c.threadId === "string";
  if (c.paneType === "browser") {
    return typeof c.paneId === "string" && typeof c.url === "string" && typeof c.targetThreadId === "string" && typeof c.createdFromThreadId === "string";
  }
  return false;
}

function isValidNode(node: unknown): node is SplitNode {
  if (!node || typeof node !== "object") return false;
  const c = node as Record<string, unknown>;
  if (c.type === "leaf") return isValidLeaf(node);
  if (c.type !== "branch") return false;
  return typeof c.id === "string" && (c.direction === "horizontal" || c.direction === "vertical") && typeof c.ratio === "number" && Array.isArray(c.children) && c.children.length === 2 && isValidNode(c.children[0]) && isValidNode(c.children[1]);
}

function isValidWorkspace(workspace: unknown): workspace is Workspace {
  if (!workspace || typeof workspace !== "object") return false;
  const c = workspace as Record<string, unknown>;
  if (typeof c.id !== "string" || typeof c.name !== "string" || typeof c.focusedLeafId !== "string" || !isValidNode(c.root)) return false;
  const root = c.root as SplitNode;
  return countLeaves(root) >= 2 && findLeaf(root, c.focusedLeafId) !== null && hasThreadLeaf(root);
}

function resolveActiveWorkspace(workspaces: readonly Workspace[], requestedId: string | null): Workspace | null {
  return requestedId ? workspaces.find((workspace) => workspace.id === requestedId) ?? null : null;
}

function findWorkspaceContainingThread(workspaces: readonly Workspace[], threadId: ThreadId): Workspace | null {
  return workspaces.find((workspace) => findLeafByThreadId(workspace.root, threadId)) ?? null;
}

function touchWorkspace(workspace: Workspace, lastVisitedAt = new Date().toISOString()): Workspace {
  return workspace.lastVisitedAt === lastVisitedAt ? workspace : { ...workspace, lastVisitedAt };
}

function buildNextWorkspaceName(workspaces: readonly Workspace[]): string {
  const prefix = "Workspace ";
  let max = 0;
  for (const workspace of workspaces) {
    if (!workspace.name.startsWith(prefix)) continue;
    const value = Number.parseInt(workspace.name.slice(prefix.length), 10);
    if (!Number.isNaN(value)) max = Math.max(max, value);
  }
  return `${prefix}${max + 1}`;
}

function sanitizeWorkspace(workspace: Workspace): Workspace | null {
  const pruned = pruneInvalidLeaves(workspace.root, new Set(collectThreadIds(workspace.root)), isDesktopMode());
  if (!pruned || pruned.type === "leaf" || !hasThreadLeaf(pruned)) return null;
  const focusedLeaf = findLeaf(pruned, workspace.focusedLeafId) ?? firstLeaf(pruned);
  return { ...workspace, root: pruned, focusedLeafId: focusedLeaf.id };
}

function readPersistedSplitView(): PersistedSplitViewState {
  if (typeof window === "undefined") return { workspaces: [], activeWorkspaceId: null };
  const parseModern = (key: string): PersistedSplitViewState | null => {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedSplitViewState;
    const workspaces = Array.isArray(parsed.workspaces) ? parsed.workspaces.flatMap((w) => {
      if (!isValidWorkspace(w)) return [];
      const sanitized = sanitizeWorkspace(w);
      return sanitized ? [sanitized] : [];
    }) : [];
    return { workspaces, activeWorkspaceId: resolveActiveWorkspace(workspaces, parsed.activeWorkspaceId)?.id ?? null };
  };
  const parseLegacySingle = (): PersistedSplitViewState | null => {
    const raw = window.localStorage.getItem(LEGACY_SINGLE_SPLIT_VIEW_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LegacyPersistedSplitViewState;
    if (!parsed.group || !isValidWorkspace({ ...parsed.group, name: "Workspace 1" })) return null;
    const workspace = sanitizeWorkspace({ ...parsed.group, name: "Workspace 1" });
    return workspace ? { workspaces: [workspace], activeWorkspaceId: workspace.id } : null;
  };
  try {
    return parseModern(SPLIT_VIEW_STORAGE_KEY) ?? parseModern(LEGACY_SPLIT_VIEW_STORAGE_KEY) ?? parseLegacySingle() ?? { workspaces: [], activeWorkspaceId: null };
  } catch {
    return { workspaces: [], activeWorkspaceId: null };
  }
}

function persistSplitView(state: SplitViewState): void {
  if (typeof window === "undefined") return;
  const data: PersistedSplitViewState = { workspaces: [...state.workspaces], activeWorkspaceId: state.activeWorkspaceId };
  window.localStorage.setItem(SPLIT_VIEW_STORAGE_KEY, JSON.stringify(data));
  window.localStorage.removeItem(LEGACY_SPLIT_VIEW_STORAGE_KEY);
  window.localStorage.removeItem(LEGACY_SINGLE_SPLIT_VIEW_STORAGE_KEY);
}

const debouncedPersist = new Debouncer(persistSplitView, { wait: 300 });

function withWorkspaceCollection(workspaces: readonly Workspace[], activeWorkspaceId: string | null) {
  const group = resolveActiveWorkspace(workspaces, activeWorkspaceId);
  return { workspaces: [...workspaces], activeWorkspaceId: group?.id ?? null, group };
}

function updateWorkspace(workspaces: readonly Workspace[], workspaceId: string, updater: (workspace: Workspace) => Workspace | null): readonly Workspace[] {
  let changed = false;
  const next: Workspace[] = [];
  for (const workspace of workspaces) {
    if (workspace.id !== workspaceId) { next.push(workspace); continue; }
    const updated = updater(workspace);
    if (updated === workspace) { next.push(workspace); continue; }
    changed = true;
    if (updated) next.push(updated);
  }
  return changed ? next : workspaces;
}

function workspaceFocusedThreadId(workspace: Workspace): ThreadId {
  const focused = findLeaf(workspace.root, workspace.focusedLeafId) ?? firstLeaf(workspace.root);
  if (focused.paneType === "thread") return focused.threadId;
  return focused.targetThreadId;
}

export interface SplitViewState {
  workspaces: readonly Workspace[];
  activeWorkspaceId: string | null;
  group: Workspace | null;
  dragOver: { leafId: string; zone: DropZone } | null;
  zoomed: boolean;
}

export interface SplitViewActions {
  splitThread: (currentThreadId: ThreadId, newThreadId: ThreadId, direction: SplitDirection, insertBefore: boolean) => void;
  splitLeaf: (leafId: string, newThreadId: ThreadId, direction: SplitDirection, insertBefore: boolean) => void;
  splitThreadWithBrowser: (currentThreadId: ThreadId, direction: SplitDirection) => string | null;
  splitLeafWithBrowser: (leafId: string, direction: SplitDirection) => string | null;
  closePane: (leafId: string) => ThreadId | null;
  closeBrowserPane: (paneId: string) => ThreadId | null;
  updateBrowserPanePersistedState: (paneId: string, state: Partial<PersistedBrowserPaneState>) => void;
  closeWorkspace: (workspaceId: string) => ThreadId | null;
  renameWorkspace: (workspaceId: string, name: string) => void;
  activateWorkspace: (workspaceId: string) => ThreadId | null;
  deactivateWorkspace: () => void;
  setFocusedLeaf: (leafId: string) => void;
  setRatio: (branchId: string, ratio: number) => void;
  replaceThreadInFocusedLeaf: (newThreadId: ThreadId) => void;
  replaceThreadInLeaf: (leafId: string, newThreadId: ThreadId) => void;
  unsplit: () => ThreadId[];
  setDragOver: (leafId: string, zone: DropZone) => void;
  clearDragOver: () => void;
  isSplit: () => boolean;
  getFocusedThreadId: () => ThreadId | null;
  focusDirection: (direction: FocusDirection) => string | null;
  toggleZoom: () => void;
  reconcileThreads: (validThreadIds: ReadonlySet<ThreadId>) => ThreadId | null;
}

export type SplitViewStore = SplitViewState & SplitViewActions;
const persisted = readPersistedSplitView();

export const useSplitViewStore = create<SplitViewStore>((set, get) => ({
  ...withWorkspaceCollection(persisted.workspaces, persisted.activeWorkspaceId),
  dragOver: null,
  zoomed: false,
  splitThread: (currentThreadId, newThreadId, direction, insertBefore) => {
    set((state) => {
      if (currentThreadId === newThreadId) return state;
      const workspace = findWorkspaceContainingThread(state.workspaces, currentThreadId);
      const newLeaf = createThreadLeaf(newThreadId);
      if (workspace) {
        const currentLeaf = findLeafByThreadId(workspace.root, currentThreadId);
        if (!currentLeaf) return state;
        const existingLeaf = findLeafByThreadId(workspace.root, newThreadId);
        if (existingLeaf) {
          const updated = touchWorkspace({ ...workspace, focusedLeafId: existingLeaf.id });
          return { ...withWorkspaceCollection(updateWorkspace(state.workspaces, workspace.id, () => updated), workspace.id), zoomed: false, dragOver: null };
        }
        const newRoot = splitLeafNode(workspace.root, currentLeaf.id, newLeaf, direction, insertBefore);
        if (!newRoot) return state;
        const inserted = findLeafByThreadId(newRoot, newThreadId);
        const updated = touchWorkspace({ ...workspace, root: newRoot, focusedLeafId: inserted?.id ?? workspace.focusedLeafId });
        return { ...withWorkspaceCollection(updateWorkspace(state.workspaces, workspace.id, () => updated), workspace.id), zoomed: false, dragOver: null };
      }
      const existingLeaf = createThreadLeaf(currentThreadId);
      const root: SplitBranch = { type: "branch", id: splitNodeId(), direction, children: insertBefore ? [newLeaf, existingLeaf] : [existingLeaf, newLeaf], ratio: 0.5 };
      const ws: Workspace = { id: root.id, name: buildNextWorkspaceName(state.workspaces), lastVisitedAt: new Date().toISOString(), root, focusedLeafId: newLeaf.id };
      return { ...withWorkspaceCollection([...state.workspaces, ws], ws.id), zoomed: false };
    });
  },
  splitLeaf: (leafId, newThreadId, direction, insertBefore) => {
    set((state) => {
      if (!state.group) return state;
      const targetLeaf = findLeaf(state.group.root, leafId);
      if (!targetLeaf || (targetLeaf.paneType === "thread" && targetLeaf.threadId === newThreadId)) return state;
      const existingLeaf = findLeafByThreadId(state.group.root, newThreadId);
      if (existingLeaf) {
        const updated = touchWorkspace({ ...state.group, focusedLeafId: existingLeaf.id });
        return { ...withWorkspaceCollection(updateWorkspace(state.workspaces, state.group.id, () => updated), state.group.id), zoomed: false, dragOver: null };
      }
      const newRoot = splitLeafNode(state.group.root, leafId, createThreadLeaf(newThreadId), direction, insertBefore);
      if (!newRoot) return state;
      const inserted = findLeafByThreadId(newRoot, newThreadId);
      const updated = touchWorkspace({ ...state.group, root: newRoot, focusedLeafId: inserted?.id ?? state.group.focusedLeafId });
      return { ...withWorkspaceCollection(updateWorkspace(state.workspaces, state.group.id, () => updated), state.group.id), zoomed: false, dragOver: null };
    });
  },
  splitThreadWithBrowser: (currentThreadId, direction) => {
    const workspace = findWorkspaceContainingThread(get().workspaces, currentThreadId);
    if (!workspace) return null;
    const currentLeaf = findLeafByThreadId(workspace.root, currentThreadId);
    if (!currentLeaf) return null;
    const paneId = splitNodeId();
    set((state) => {
      const group = state.workspaces.find((w) => w.id === workspace.id) ?? workspace;
      const root = splitLeafNode(group.root, currentLeaf.id, createBrowserLeaf({ paneId, url: "about:blank", targetThreadId: currentThreadId, createdFromThreadId: currentThreadId }), direction, false);
      if (!root) return state;
      const browserLeaf = findBrowserLeafByPaneId(root, paneId);
      const updated = touchWorkspace({ ...group, root, focusedLeafId: browserLeaf?.id ?? group.focusedLeafId });
      return { ...withWorkspaceCollection(updateWorkspace(state.workspaces, group.id, () => updated), group.id), zoomed: false, dragOver: null };
    });
    return paneId;
  },
  splitLeafWithBrowser: (leafId, direction) => {
    const state = get();
    if (!state.group) return null;
    const sourceLeaf = findLeaf(state.group.root, leafId);
    if (!sourceLeaf || sourceLeaf.paneType !== "thread") return null;
    return get().splitThreadWithBrowser(sourceLeaf.threadId, direction);
  },
  closePane: (leafId) => {
    const state = get();
    if (!state.group) return null;
    const remaining = removeLeaf(state.group.root, leafId);
    if (!remaining || remaining.type === "leaf") {
      let fallback: ThreadId | null = null;
      if (remaining && remaining.type === "leaf") {
        fallback = remaining.paneType === "thread" ? remaining.threadId : remaining.targetThreadId;
      }
      set({ ...withWorkspaceCollection(state.workspaces.filter((w) => w.id !== state.group?.id), null), zoomed: false, dragOver: null });
      return fallback;
    }
    const focusedLeaf = state.group.focusedLeafId === leafId ? firstLeaf(remaining) : findLeaf(remaining, state.group.focusedLeafId) ?? firstLeaf(remaining);
    const updated = touchWorkspace({ ...state.group, root: remaining, focusedLeafId: focusedLeaf.id });
    set({ ...withWorkspaceCollection(updateWorkspace(state.workspaces, state.group.id, () => updated), state.group.id), zoomed: false, dragOver: null });
    return null;
  },
  closeBrowserPane: (paneId) => {
    const state = get();
    const leaf = state.group ? findBrowserLeafByPaneId(state.group.root, paneId) : null;
    return leaf ? get().closePane(leaf.id) : null;
  },
  updateBrowserPanePersistedState: (paneId, paneState) => {
    set((state) => {
      if (!state.group) return state;
      const root = updateBrowserLeafState(state.group.root, paneId, paneState);
      if (!root) return state;
      const updated = touchWorkspace({ ...state.group, root });
      return { ...withWorkspaceCollection(updateWorkspace(state.workspaces, state.group.id, () => updated), state.group.id) };
    });
  },
  closeWorkspace: (workspaceId) => {
    const state = get();
    const workspace = state.workspaces.find((entry) => entry.id === workspaceId);
    if (!workspace) return null;
    const nextWorkspaces = state.workspaces.filter((entry) => entry.id !== workspaceId);
    const fallbackThreadId = state.activeWorkspaceId === workspaceId ? workspaceFocusedThreadId(workspace) : null;
    set({ ...withWorkspaceCollection(nextWorkspaces, state.activeWorkspaceId === workspaceId ? null : state.activeWorkspaceId), zoomed: state.activeWorkspaceId === workspaceId ? false : state.zoomed, dragOver: state.activeWorkspaceId === workspaceId ? null : state.dragOver });
    return fallbackThreadId;
  },
  renameWorkspace: (workspaceId, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    set((state) => ({ ...withWorkspaceCollection(updateWorkspace(state.workspaces, workspaceId, (workspace) => workspace.name === trimmed ? workspace : { ...workspace, name: trimmed }), state.activeWorkspaceId) }));
  },
  activateWorkspace: (workspaceId) => {
    const state = get();
    const workspace = state.workspaces.find((entry) => entry.id === workspaceId) ?? null;
    if (!workspace) return null;
    const lastVisitedAt = new Date().toISOString();
    set({ ...withWorkspaceCollection(updateWorkspace(state.workspaces, workspaceId, (entry) => touchWorkspace(entry, lastVisitedAt)), workspaceId), zoomed: false, dragOver: null });
    return workspaceFocusedThreadId(touchWorkspace(workspace, lastVisitedAt));
  },
  deactivateWorkspace: () => set((state) => state.activeWorkspaceId === null && state.group === null ? state : { ...withWorkspaceCollection(state.workspaces, null), zoomed: false, dragOver: null }),
  setFocusedLeaf: (leafId) => set((state) => !state.group || state.group.focusedLeafId === leafId ? state : { ...withWorkspaceCollection(updateWorkspace(state.workspaces, state.group.id, () => touchWorkspace({ ...state.group!, focusedLeafId: leafId })), state.group.id) }),
  setRatio: (branchId, ratio) => set((state) => {
    if (!state.group) return state;
    const root = updateBranchRatio(state.group.root, branchId, ratio);
    if (!root) return state;
    return { ...withWorkspaceCollection(updateWorkspace(state.workspaces, state.group.id, () => ({ ...touchWorkspace(state.group!), root })), state.group.id) };
  }),
  replaceThreadInFocusedLeaf: (newThreadId) => {
    const state = get();
    if (!state.group) return;
    get().replaceThreadInLeaf(state.group.focusedLeafId, newThreadId);
  },
  replaceThreadInLeaf: (leafId, newThreadId) => set((state) => {
    if (!state.group) return state;
    const leaf = findLeaf(state.group.root, leafId);
    if (!leaf || leaf.paneType !== "thread") return state;
    const root = replaceLeaf(state.group.root, leafId, { ...leaf, threadId: newThreadId });
    if (!root) return state;
    return { ...withWorkspaceCollection(updateWorkspace(state.workspaces, state.group.id, () => ({ ...touchWorkspace(state.group!), root })), state.group.id) };
  }),
  unsplit: () => {
    const state = get();
    if (!state.group) return [];
    const threadIds = collectThreadIds(state.group.root);
    set({ ...withWorkspaceCollection(state.workspaces.filter((workspace) => workspace.id !== state.group?.id), null), zoomed: false, dragOver: null });
    return threadIds;
  },
  setDragOver: (leafId, zone) => set({ dragOver: { leafId, zone } }),
  clearDragOver: () => set((state) => state.dragOver ? { dragOver: null } : state),
  isSplit: () => get().group !== null,
  getFocusedThreadId: () => {
    const state = get();
    if (!state.group) return null;
    const leaf = findLeaf(state.group.root, state.group.focusedLeafId);
    if (!leaf) return null;
    return leaf.paneType === "thread" ? leaf.threadId : leaf.targetThreadId;
  },
  focusDirection: (direction) => {
    const state = get();
    if (!state.group) return null;
    const target = findLeafInDirection(state.group.root, state.group.focusedLeafId, direction);
    if (!target) return null;
    set({ ...withWorkspaceCollection(updateWorkspace(state.workspaces, state.group.id, () => touchWorkspace({ ...state.group!, focusedLeafId: target.id })), state.group.id), zoomed: false });
    return target.id;
  },
  toggleZoom: () => set((state) => !state.group ? state : { zoomed: !state.zoomed }),
  reconcileThreads: (validThreadIds) => {
    const state = get();
    let activeFallbackThreadId: ThreadId | null = null;
    const nextWorkspaces: Workspace[] = [];
    for (const workspace of state.workspaces) {
      const root = pruneInvalidLeaves(workspace.root, validThreadIds, isDesktopMode());
      if (!root) continue;
      if (root.type === "leaf") {
        activeFallbackThreadId = root.paneType === "thread" ? root.threadId : root.targetThreadId;
        continue;
      }
      if (!hasThreadLeaf(root)) continue;
      const focused = findLeaf(root, workspace.focusedLeafId) ?? firstLeaf(root);
      nextWorkspaces.push({ ...workspace, root, focusedLeafId: focused.id });
    }
    const nextActive = resolveActiveWorkspace(nextWorkspaces, state.activeWorkspaceId);
    set({ ...withWorkspaceCollection(nextWorkspaces, nextActive?.id ?? null), zoomed: false, dragOver: null });
    return nextActive ? workspaceFocusedThreadId(nextActive) : activeFallbackThreadId;
  },
}));

useSplitViewStore.subscribe((state) => debouncedPersist.maybeExecute(state));
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => debouncedPersist.flush());
}
