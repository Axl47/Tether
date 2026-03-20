import { useLayoutEffect } from "react";

const APP_VIEWPORT_HEIGHT_CSS_VAR = "--app-viewport-height";

function readViewportHeight(): number {
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  return Math.max(0, Math.round(viewportHeight));
}

function resetDocumentScrollPosition(): void {
  const scrollingElement = document.scrollingElement;
  if (window.scrollX !== 0 || window.scrollY !== 0) {
    window.scrollTo(0, 0);
  }
  if (scrollingElement && (scrollingElement.scrollLeft !== 0 || scrollingElement.scrollTop !== 0)) {
    scrollingElement.scrollLeft = 0;
    scrollingElement.scrollTop = 0;
  }
}

export function useAppViewportHeight(): void {
  useLayoutEffect(() => {
    let frameId: number | null = null;

    const syncViewportHeight = () => {
      frameId = null;
      document.documentElement.style.setProperty(
        APP_VIEWPORT_HEIGHT_CSS_VAR,
        `${readViewportHeight()}px`,
      );
      resetDocumentScrollPosition();
    };

    const scheduleSync = () => {
      if (frameId !== null) {
        return;
      }
      frameId = window.requestAnimationFrame(syncViewportHeight);
    };

    scheduleSync();

    const viewport = window.visualViewport;
    window.addEventListener("resize", scheduleSync);
    window.addEventListener("orientationchange", scheduleSync);
    window.addEventListener("scroll", scheduleSync, { passive: true });
    viewport?.addEventListener("resize", scheduleSync);
    viewport?.addEventListener("scroll", scheduleSync);
    document.addEventListener("focusin", scheduleSync, true);
    document.addEventListener("focusout", scheduleSync, true);

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      window.removeEventListener("resize", scheduleSync);
      window.removeEventListener("orientationchange", scheduleSync);
      window.removeEventListener("scroll", scheduleSync);
      viewport?.removeEventListener("resize", scheduleSync);
      viewport?.removeEventListener("scroll", scheduleSync);
      document.removeEventListener("focusin", scheduleSync, true);
      document.removeEventListener("focusout", scheduleSync, true);
      document.documentElement.style.removeProperty(APP_VIEWPORT_HEIGHT_CSS_VAR);
    };
  }, []);
}
