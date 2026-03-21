import type { NativeApi } from "@t3tools/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __flushBrowserPaneLayoutCoordinatorForTests,
  __resetBrowserPaneLayoutCoordinatorForTests,
  registerBrowserPaneHost,
} from "./browserPaneLayoutCoordinator";

class MockResizeObserver {
  observe = vi.fn<(target: Element) => void>();
  unobserve = vi.fn<(target: Element) => void>();
  disconnect = vi.fn<() => void>();
}

function createApiMocks() {
  const setBounds = vi.fn(async () => {});
  const setVisible = vi.fn(async () => {});

  return {
    setBounds,
    setVisible,
    api: {
      browser: {
        setBounds,
        setVisible,
      },
    } as unknown as NativeApi,
  };
}

function toDomRect(rect: { left: number; top: number; width: number; height: number }): DOMRect {
  return {
    ...rect,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    x: rect.left,
    y: rect.top,
    toJSON: () => ({}),
  } as DOMRect;
}

function createPaneElements(input: {
  leafRect: { left: number; top: number; width: number; height: number };
  hostRect: { left: number; top: number; width: number; height: number };
}): {
  host: HTMLElement;
  setHostRect: (rect: { left: number; top: number; width: number; height: number }) => void;
} {
  let hostRect = input.hostRect;
  const leaf = {
    getBoundingClientRect: () => toDomRect(input.leafRect),
  } as unknown as HTMLElement;
  const host = {
    isConnected: true,
    closest: (selector: string) => (selector === "[data-split-leaf-id]" ? leaf : null),
    getBoundingClientRect: () => toDomRect(hostRect),
  } as unknown as HTMLElement;

  return {
    host,
    setHostRect: (rect) => {
      hostRect = rect;
    },
  };
}

function stubWindow(): void {
  vi.stubGlobal("window", {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    requestAnimationFrame: vi.fn(() => 1),
    cancelAnimationFrame: vi.fn(),
  });
}

afterEach(() => {
  __resetBrowserPaneLayoutCoordinatorForTests();
  vi.unstubAllGlobals();
});

describe("browserPaneLayoutCoordinator", () => {
  it("registers a host and sends its measured bounds once", () => {
    stubWindow();
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
    const { api, setBounds, setVisible } = createApiMocks();
    const { host } = createPaneElements({
      leafRect: { left: 20, top: 30, width: 400, height: 300 },
      hostRect: { left: 40, top: 60, width: 200, height: 120 },
    });

    const unregister = registerBrowserPaneHost({ paneId: "pane-1", api, element: host });
    __flushBrowserPaneLayoutCoordinatorForTests();

    expect(setBounds).toHaveBeenCalledTimes(1);
    expect(setBounds).toHaveBeenCalledWith({
      paneId: "pane-1",
      bounds: { left: 40, top: 60, width: 200, height: 120 },
    });
    expect(setVisible).toHaveBeenCalledWith({ paneId: "pane-1", visible: true });

    unregister();
  });

  it("only re-sends bounds when they change", () => {
    stubWindow();
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
    const { api, setBounds } = createApiMocks();
    const { host, setHostRect } = createPaneElements({
      leafRect: { left: 0, top: 0, width: 500, height: 400 },
      hostRect: { left: 10, top: 12, width: 220, height: 180 },
    });

    const unregister = registerBrowserPaneHost({ paneId: "pane-2", api, element: host });
    __flushBrowserPaneLayoutCoordinatorForTests();
    __flushBrowserPaneLayoutCoordinatorForTests();

    expect(setBounds).toHaveBeenCalledTimes(1);

    setHostRect({ left: 16, top: 20, width: 240, height: 200 });
    __flushBrowserPaneLayoutCoordinatorForTests();

    expect(setBounds).toHaveBeenCalledTimes(2);
    expect(setBounds).toHaveBeenLastCalledWith({
      paneId: "pane-2",
      bounds: { left: 16, top: 20, width: 240, height: 200 },
    });

    unregister();
  });

  it("hides the pane when it unregisters", () => {
    stubWindow();
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
    const { api, setVisible } = createApiMocks();
    const { host } = createPaneElements({
      leafRect: { left: 5, top: 5, width: 300, height: 200 },
      hostRect: { left: 10, top: 12, width: 180, height: 100 },
    });

    const unregister = registerBrowserPaneHost({ paneId: "pane-3", api, element: host });
    __flushBrowserPaneLayoutCoordinatorForTests();
    unregister();

    expect(setVisible).toHaveBeenLastCalledWith({ paneId: "pane-3", visible: false });
  });
});
