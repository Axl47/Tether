import type { ThreadId } from "@t3tools/contracts";
import { collectThreadIds, type BrowserPaneLeaf, useSplitViewStore } from "../splitViewStore";
import { readNativeApi } from "../nativeApi";
import { useBrowserPaneRuntimeStore } from "../browserPaneRuntimeStore";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useComposerDraftStore, type ComposerImageAttachment } from "../composerDraftStore";
import { formatDuration } from "../session-logic";
import { useStore } from "../store";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "./ui/select";
import { toastManager } from "./ui/toast";

function intersectRects(
  a: DOMRect | { left: number; top: number; right: number; bottom: number },
  b: DOMRect | { left: number; top: number; right: number; bottom: number },
) {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.right, b.right);
  const bottom = Math.min(a.bottom, b.bottom);
  return {
    left,
    top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

function makeAttachmentFromDataUrl(dataUrl: string, name: string): ComposerImageAttachment {
  const [header = "", payload = ""] = dataUrl.split(",", 2);
  const mimeType = header.match(/data:(.*?)(;base64)?$/)?.[1] ?? "image/png";
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const file = new File([bytes], name, { type: mimeType });
  return {
    type: "image",
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    mimeType,
    sizeBytes: file.size,
    previewUrl: dataUrl,
    file,
  };
}

export function BrowserPane({ leaf }: { leaf: BrowserPaneLeaf }) {
  const api = readNativeApi();
  const hostRef = useRef<HTMLDivElement>(null);
  const lastBoundsRef = useRef<{
    left: number;
    top: number;
    width: number;
    height: number;
    visible: boolean;
  } | null>(null);
  const [url, setUrl] = useState(leaf.url);
  const [drawer, setDrawer] = useState<"console" | "network" | null>(null);
  const snapshot = useBrowserPaneRuntimeStore((state) => state.snapshotsByPaneId[leaf.paneId]);
  const setSnapshot = useBrowserPaneRuntimeStore((state) => state.setSnapshot);
  const splitGroup = useSplitViewStore((state) => state.group);
  const updateBrowserPanePersistedState = useSplitViewStore(
    (state) => state.updateBrowserPanePersistedState,
  );
  const addImage = useComposerDraftStore((state) => state.addImage);
  const setPrompt = useComposerDraftStore((state) => state.setPrompt);
  const threads = useStore((state) => state.threads);

  useEffect(() => {
    if (!api) return;
    void api.browser.ensurePane({
      paneId: leaf.paneId,
      url: leaf.url,
      targetThreadId: leaf.targetThreadId,
      createdFromThreadId: leaf.createdFromThreadId,
    });
  }, [api, leaf.createdFromThreadId, leaf.paneId, leaf.targetThreadId, leaf.url]);

  useEffect(() => {
    if (!api) return;
    void api.browser
      .getSnapshot({ paneId: leaf.paneId })
      .then(setSnapshot)
      .catch(() => {});
    return () => {
      void api.browser.destroyPane({ paneId: leaf.paneId });
    };
  }, [api, leaf.paneId, setSnapshot]);

  useEffect(() => {
    setUrl(leaf.url);
  }, [leaf.url]);

  useEffect(() => {
    if (!snapshot || snapshot.url === leaf.url) return;
    updateBrowserPanePersistedState(leaf.paneId, { url: snapshot.url });
  }, [leaf.paneId, leaf.url, snapshot, updateBrowserPanePersistedState]);

  useLayoutEffect(() => {
    if (!api || !hostRef.current) return;
    let frameId = 0;
    const updateBounds = () => {
      const host = hostRef.current;
      const rect = host?.getBoundingClientRect();
      if (!host || !rect) return;
      const leafElement = host.closest("[data-split-leaf-id]");
      const leafRect =
        leafElement instanceof HTMLElement ? leafElement.getBoundingClientRect() : null;
      const boundedRect = leafRect ? intersectRects(rect, leafRect) : rect;
      const next = {
        left: Math.round(boundedRect.left),
        top: Math.round(boundedRect.top),
        width: Math.max(0, Math.round(boundedRect.width)),
        height: Math.max(0, Math.round(boundedRect.height)),
        visible: boundedRect.width > 0 && boundedRect.height > 0,
      };
      const previous = lastBoundsRef.current;
      if (
        !previous ||
        previous.left !== next.left ||
        previous.top !== next.top ||
        previous.width !== next.width ||
        previous.height !== next.height
      ) {
        void api.browser.setBounds({
          paneId: leaf.paneId,
          bounds: {
            left: next.left,
            top: next.top,
            width: next.width,
            height: next.height,
          },
        });
      }
      if (!previous || previous.visible !== next.visible) {
        void api.browser.setVisible({
          paneId: leaf.paneId,
          visible: next.visible,
        });
      }
      lastBoundsRef.current = next;
    };
    const tick = () => {
      updateBounds();
      frameId = window.requestAnimationFrame(tick);
    };
    const observer = new ResizeObserver(updateBounds);
    observer.observe(hostRef.current);
    frameId = window.requestAnimationFrame(tick);
    window.addEventListener("resize", updateBounds);
    updateBounds();
    return () => {
      window.cancelAnimationFrame(frameId);
      observer.disconnect();
      window.removeEventListener("resize", updateBounds);
      lastBoundsRef.current = null;
      void api.browser.setVisible({ paneId: leaf.paneId, visible: false });
    };
  }, [api, leaf.paneId]);

  const title = snapshot?.title || "Browser";
  const targetThreadOptions = useMemo(() => {
    const openThreadIds = splitGroup ? collectThreadIds(splitGroup.root) : [leaf.targetThreadId];
    const uniqueThreadIds = [...new Set(openThreadIds)];
    return uniqueThreadIds.map((threadId) => {
      const thread = threads.find((entry) => entry.id === threadId);
      return {
        id: threadId,
        label: thread?.title?.trim() || threadId,
      };
    });
  }, [leaf.targetThreadId, splitGroup, threads]);
  const consoleText = useMemo(
    () =>
      snapshot?.consoleEntries
        .map((entry) => `- ${entry.timestamp} [${entry.level}] ${entry.message}`)
        .join("\n") ?? "",
    [snapshot],
  );
  const networkText = useMemo(
    () =>
      snapshot?.networkEntries
        .map((entry) => {
          const status = entry.status ?? "ERR";
          const duration = entry.durationMs === null ? null : formatDuration(entry.durationMs);
          const failureReason = entry.failureReason ? ` (${entry.failureReason})` : "";
          return `- ${entry.timestamp} ${entry.method} ${entry.url} ${status}${duration ? ` · ${duration}` : ""}${failureReason}`;
        })
        .join("\n") ?? "",
    [snapshot],
  );

  if (!api) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Browser panes are desktop-only.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 w-full flex-col gap-2 overflow-hidden p-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => void api.browser.goBack({ paneId: leaf.paneId })}
          className="shrink-0"
        >
          {"<"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void api.browser.goForward({ paneId: leaf.paneId })}
          className="shrink-0"
        >
          {">"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void api.browser.reload({ paneId: leaf.paneId })}
          className="shrink-0"
        >
          Reload
        </Button>
        <Input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void api.browser.navigate({ paneId: leaf.paneId, url });
          }}
          className="h-8 min-w-0 flex-1 basis-64"
        />
        <Button
          size="sm"
          onClick={() => void api.browser.navigate({ paneId: leaf.paneId, url })}
          className="shrink-0"
        >
          Go
        </Button>
        <Button
          size="sm"
          variant={drawer === "console" ? "default" : "outline"}
          onClick={() => setDrawer(drawer === "console" ? null : "console")}
          className="shrink-0"
        >
          Console
        </Button>
        <Button
          size="sm"
          variant={drawer === "network" ? "default" : "outline"}
          onClick={() => setDrawer(drawer === "network" ? null : "network")}
          className="shrink-0"
        >
          Network
        </Button>
        <Select
          value={leaf.targetThreadId}
          onValueChange={(value) =>
            updateBrowserPanePersistedState(leaf.paneId, { targetThreadId: value as ThreadId })
          }
          items={targetThreadOptions.map((option) => ({
            value: option.id,
            label: option.label,
          }))}
        >
          <SelectTrigger size="sm" className="max-w-56 min-w-40 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectPopup>
            {targetThreadOptions.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0"
          onClick={async () => {
            const screenshot = await api.browser.captureScreenshot({ paneId: leaf.paneId });
            addImage(
              leaf.targetThreadId,
              makeAttachmentFromDataUrl(screenshot.dataUrl, `${title || "page"}.png`),
            );
            toastManager.add({
              type: "success",
              title: "Screenshot added",
              description: `Staged in ${leaf.targetThreadId}.`,
            });
          }}
        >
          Add Screenshot
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0"
          onClick={() => {
            const base =
              useComposerDraftStore.getState().draftsByThreadId[leaf.targetThreadId]?.prompt ?? "";
            setPrompt(
              leaf.targetThreadId,
              `${base}${base ? "\n\n" : ""}## Console Logs\n${consoleText}`,
            );
            toastManager.add({
              type: "success",
              title: "Console logs inserted",
              description: `Inserted into ${leaf.targetThreadId}.`,
            });
          }}
        >
          Insert Console Logs
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0"
          onClick={() => {
            const base =
              useComposerDraftStore.getState().draftsByThreadId[leaf.targetThreadId]?.prompt ?? "";
            setPrompt(
              leaf.targetThreadId,
              `${base}${base ? "\n\n" : ""}## Network Logs\n${networkText}`,
            );
            toastManager.add({
              type: "success",
              title: "Network logs inserted",
              description: `Inserted into ${leaf.targetThreadId}.`,
            });
          }}
        >
          Insert Network Logs
        </Button>
      </div>
      <div className="rounded border border-border px-3 py-1 text-xs text-muted-foreground">
        {title} · {snapshot?.url ?? leaf.url}
      </div>
      <div
        ref={hostRef}
        className="min-h-0 min-w-0 flex-1 rounded border border-border bg-background"
      />
      {drawer ? (
        <pre className="max-h-48 min-w-0 overflow-auto rounded border border-border bg-muted p-3 text-xs">
          {drawer === "console" ? consoleText : networkText}
        </pre>
      ) : null}
    </div>
  );
}
