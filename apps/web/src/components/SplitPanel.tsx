import {
  useCallback,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import type { ThreadId } from "@t3tools/contracts";
import {
  type SplitNode,
  type SplitLeaf,
  type SplitBranch,
  type DropZone,
  computeClosestDropZone,
  useSplitViewStore,
  findLeaf,
} from "../splitViewStore";

type SplitDropHandler = (
  leafId: string,
  threadId: ThreadId | null,
  projectId: string | null,
  zone: DropZone,
) => void;

const SPLIT_GAP_PX = 8;

function ResizeHandle({ branchId, direction }: { branchId: string; direction: "horizontal" | "vertical" }) {
  const setRatio = useSplitViewStore((s) => s.setRatio);
  const handleRef = useRef<HTMLDivElement>(null);
  const onMouseDown = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    const handle = handleRef.current;
    const parent = handle?.parentElement;
    if (!handle || !parent) return;
    const rect = parent.getBoundingClientRect();
    const onMouseMove = (moveEvent: globalThis.MouseEvent) => {
      const ratio = direction === "horizontal"
        ? (moveEvent.clientX - rect.left) / rect.width
        : (moveEvent.clientY - rect.top) / rect.height;
      setRatio(branchId, ratio);
    };
    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = direction === "horizontal" ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [branchId, direction, setRatio]);
  return <div ref={handleRef} onMouseDown={onMouseDown} className={direction === "horizontal" ? "w-2 cursor-col-resize" : "h-2 cursor-row-resize"} />;
}

export function SplitPlaceholder() {
  return <div className="flex h-full w-full items-center justify-center rounded-lg border-2 border-dashed border-primary/30 bg-primary/5" />;
}

export function SplitDropPreview({ zone, children }: { zone: DropZone | null; children: ReactNode }) {
  return <div className="relative flex h-full min-h-0 w-full min-w-0 flex-1 overflow-hidden rounded-[inherit]">{children}{zone === "center" ? <div className="absolute inset-0 p-2"><SplitPlaceholder /></div> : null}</div>;
}

function LeafPane({ leaf, isFocused, isZoomed, showDropZones, renderLeaf, onSplitDrop, onFocusLeaf }: {
  leaf: SplitLeaf;
  isFocused: boolean;
  isZoomed: boolean;
  showDropZones: boolean;
  renderLeaf: (leaf: SplitLeaf) => ReactNode;
  onSplitDrop: SplitDropHandler | undefined;
  onFocusLeaf: ((leaf: SplitLeaf) => void) | undefined;
}) {
  const setFocusedLeaf = useSplitViewStore((s) => s.setFocusedLeaf);
  const setDragOver = useSplitViewStore((s) => s.setDragOver);
  const clearDragOver = useSplitViewStore((s) => s.clearDragOver);
  const activeZone = useSplitViewStore((s) => s.dragOver?.leafId === leaf.id ? s.dragOver.zone : null);
  return (
    <div
      data-split-leaf-id={leaf.id}
      tabIndex={-1}
      className={`group/split-pane relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg bg-background ${isZoomed ? "opacity-100" : isFocused ? "ring-2 ring-primary/30 ring-inset opacity-100" : "opacity-60"}`}
      onMouseDown={() => { setFocusedLeaf(leaf.id); onFocusLeaf?.(leaf); }}
      onFocus={() => { setFocusedLeaf(leaf.id); onFocusLeaf?.(leaf); }}
      onDragLeave={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        if (e.clientX <= rect.left || e.clientX >= rect.right || e.clientY <= rect.top || e.clientY >= rect.bottom) clearDragOver();
      }}
      onDrop={(e) => {
        e.preventDefault();
        const zone = activeZone;
        clearDragOver();
        if (!zone || !onSplitDrop) return;
        const droppedThreadId = e.dataTransfer.getData("application/t3-thread-id") || null;
        const droppedProjectId = e.dataTransfer.getData("application/t3-project-id") || null;
        const dragType = e.dataTransfer.getData("application/t3-drag-type");
        if (dragType === "project") onSplitDrop(leaf.id, null, droppedProjectId, zone);
        else if (droppedThreadId) onSplitDrop(leaf.id, droppedThreadId as ThreadId, droppedProjectId, zone);
      }}
    >
      {showDropZones ? <div className="absolute inset-0 z-30" onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(leaf.id, computeClosestDropZone(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())); }} /> : null}
      <SplitDropPreview zone={activeZone}>{renderLeaf(leaf)}</SplitDropPreview>
    </div>
  );
}

function SplitPanelNode({ node, focusedLeafId, showDropZones, renderLeaf, onSplitDrop, onFocusLeaf, zoomedLeafId }: {
  node: SplitNode;
  focusedLeafId: string;
  showDropZones: boolean;
  renderLeaf: (leaf: SplitLeaf) => ReactNode;
  onSplitDrop: SplitDropHandler | undefined;
  onFocusLeaf: ((leaf: SplitLeaf) => void) | undefined;
  zoomedLeafId: string | null;
}) {
  if (node.type === "leaf") {
    if (zoomedLeafId && node.id !== zoomedLeafId) return null;
    return <LeafPane leaf={node} isFocused={node.id === focusedLeafId} isZoomed={zoomedLeafId === null || node.id === zoomedLeafId} showDropZones={showDropZones} renderLeaf={renderLeaf} onSplitDrop={onSplitDrop} onFocusLeaf={onFocusLeaf} />;
  }
  return (
    <div className={`flex min-h-0 min-w-0 flex-1 ${node.direction === "horizontal" ? "flex-row" : "flex-col"}`}>
      <SplitPanelNode node={node.children[0]} focusedLeafId={focusedLeafId} showDropZones={showDropZones} renderLeaf={renderLeaf} onSplitDrop={onSplitDrop} onFocusLeaf={onFocusLeaf} zoomedLeafId={zoomedLeafId} />
      <ResizeHandle branchId={node.id} direction={node.direction} />
      <SplitPanelNode node={node.children[1]} focusedLeafId={focusedLeafId} showDropZones={showDropZones} renderLeaf={renderLeaf} onSplitDrop={onSplitDrop} onFocusLeaf={onFocusLeaf} zoomedLeafId={zoomedLeafId} />
    </div>
  );
}

export interface SplitPanelRootProps {
  renderLeaf: (leaf: SplitLeaf) => ReactNode;
  onSplitDrop?: SplitDropHandler;
  onFocusLeaf?: (leaf: SplitLeaf) => void;
}

export function SplitPanelRoot({ renderLeaf, onSplitDrop, onFocusLeaf }: SplitPanelRootProps) {
  const group = useSplitViewStore((s) => s.group);
  const zoomed = useSplitViewStore((s) => s.zoomed);
  if (!group) return null;
  const zoomedLeaf = zoomed ? findLeaf(group.root, group.focusedLeafId) : null;
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden rounded-lg bg-muted p-1">
      <SplitPanelNode node={group.root} focusedLeafId={group.focusedLeafId} showDropZones={!zoomed} renderLeaf={renderLeaf} onSplitDrop={onSplitDrop} onFocusLeaf={onFocusLeaf} zoomedLeafId={zoomedLeaf?.id ?? null} />
    </div>
  );
}
