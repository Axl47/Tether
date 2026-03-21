import type { BrowserPaneLeaf } from "../splitViewStore";
import { readNativeApi } from "../nativeApi";
import { useBrowserPaneRuntimeStore } from "../browserPaneRuntimeStore";
import { useSplitViewStore } from "../splitViewStore";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useComposerDraftStore, type ComposerImageAttachment } from "../composerDraftStore";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
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
  const updateBrowserPanePersistedState = useSplitViewStore(
    (state) => state.updateBrowserPanePersistedState,
  );
  const addImage = useComposerDraftStore((state) => state.addImage);
  const setPrompt = useComposerDraftStore((state) => state.setPrompt);

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
        .map(
          (entry) => `- ${entry.timestamp} ${entry.method} ${entry.url} ${entry.status ?? "ERR"}`,
        )
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
