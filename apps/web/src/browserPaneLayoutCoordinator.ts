import type { NativeApi } from "@t3tools/contracts";

interface MeasuredPaneBounds {
  left: number;
  top: number;
  width: number;
  height: number;
  visible: boolean;
}

interface BrowserPaneLayoutRegistration {
  paneId: string;
  api: NativeApi;
  element: HTMLElement;
  lastBounds: MeasuredPaneBounds | null;
}

const registrations = new Map<string, BrowserPaneLayoutRegistration>();
let resizeObserver: ResizeObserver | null = null;
let rafId = 0;
let pendingFrames = 0;
let listenersAttached = false;

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

function measurePaneBounds(element: HTMLElement): MeasuredPaneBounds {
  if (!element.isConnected) {
    return { left: 0, top: 0, width: 0, height: 0, visible: false };
  }

  const rect = element.getBoundingClientRect();
  const leafElement = element.closest("[data-split-leaf-id]");
  const leafRect =
    leafElement && typeof (leafElement as Element).getBoundingClientRect === "function"
      ? (leafElement as Element).getBoundingClientRect()
      : null;
  const boundedRect = leafRect ? intersectRects(rect, leafRect) : rect;

  return {
    left: Math.round(boundedRect.left),
    top: Math.round(boundedRect.top),
    width: Math.max(0, Math.round(boundedRect.width)),
    height: Math.max(0, Math.round(boundedRect.height)),
    visible: boundedRect.width > 0 && boundedRect.height > 0,
  };
}

function handleGlobalLayoutChange(): void {
  scheduleBrowserPaneLayoutMeasurement(3);
}

function ensureResizeObserver(): void {
  if (resizeObserver || typeof ResizeObserver === "undefined") return;
  resizeObserver = new ResizeObserver(() => {
    scheduleBrowserPaneLayoutMeasurement(3);
  });
  for (const registration of registrations.values()) {
    resizeObserver.observe(registration.element);
  }
}

function ensureGlobalListeners(): void {
  if (listenersAttached || typeof window === "undefined") return;
  window.addEventListener("resize", handleGlobalLayoutChange, { passive: true });
  window.addEventListener("scroll", handleGlobalLayoutChange, { passive: true, capture: true });
  window.addEventListener("transitionend", handleGlobalLayoutChange, true);
  listenersAttached = true;
}

function cleanupGlobalListeners(): void {
  if (!listenersAttached || typeof window === "undefined") return;
  window.removeEventListener("resize", handleGlobalLayoutChange);
  window.removeEventListener("scroll", handleGlobalLayoutChange, true);
  window.removeEventListener("transitionend", handleGlobalLayoutChange, true);
  listenersAttached = false;
}

function flushMeasurements(): void {
  rafId = 0;
  let changed = false;

  for (const registration of registrations.values()) {
    const nextBounds = measurePaneBounds(registration.element);
    const previous = registration.lastBounds;
    if (
      !previous ||
      previous.left !== nextBounds.left ||
      previous.top !== nextBounds.top ||
      previous.width !== nextBounds.width ||
      previous.height !== nextBounds.height
    ) {
      void registration.api.browser.setBounds({
        paneId: registration.paneId,
        bounds: {
          left: nextBounds.left,
          top: nextBounds.top,
          width: nextBounds.width,
          height: nextBounds.height,
        },
      });
      changed = true;
    }
    if (!previous || previous.visible !== nextBounds.visible) {
      void registration.api.browser.setVisible({
        paneId: registration.paneId,
        visible: nextBounds.visible,
      });
      changed = true;
    }
    registration.lastBounds = nextBounds;
  }

  if (pendingFrames > 0) pendingFrames -= 1;
  if ((changed || pendingFrames > 0) && typeof window !== "undefined") {
    rafId = window.requestAnimationFrame(() => {
      flushMeasurements();
    });
  }
}

export function scheduleBrowserPaneLayoutMeasurement(frames = 2): void {
  if (typeof window === "undefined") return;
  pendingFrames = Math.max(pendingFrames, frames);
  if (rafId !== 0) return;
  rafId = window.requestAnimationFrame(() => {
    flushMeasurements();
  });
}

export function registerBrowserPaneHost(input: {
  paneId: string;
  api: NativeApi;
  element: HTMLElement;
}): () => void {
  const registration: BrowserPaneLayoutRegistration = {
    paneId: input.paneId,
    api: input.api,
    element: input.element,
    lastBounds: null,
  };
  registrations.set(input.paneId, registration);
  ensureResizeObserver();
  resizeObserver?.observe(input.element);
  ensureGlobalListeners();
  scheduleBrowserPaneLayoutMeasurement(4);

  return () => {
    const current = registrations.get(input.paneId);
    if (current?.element === input.element) {
      registrations.delete(input.paneId);
    }
    resizeObserver?.unobserve(input.element);
    void input.api.browser.setVisible({ paneId: input.paneId, visible: false });
    if (registrations.size === 0) {
      if (rafId !== 0 && typeof window !== "undefined") {
        window.cancelAnimationFrame(rafId);
      }
      rafId = 0;
      pendingFrames = 0;
      resizeObserver?.disconnect();
      resizeObserver = null;
      cleanupGlobalListeners();
    }
  };
}

export function __flushBrowserPaneLayoutCoordinatorForTests(): void {
  flushMeasurements();
}

export function __resetBrowserPaneLayoutCoordinatorForTests(): void {
  registrations.clear();
  if (rafId !== 0 && typeof window !== "undefined") {
    window.cancelAnimationFrame(rafId);
  }
  rafId = 0;
  pendingFrames = 0;
  resizeObserver?.disconnect();
  resizeObserver = null;
  cleanupGlobalListeners();
}
