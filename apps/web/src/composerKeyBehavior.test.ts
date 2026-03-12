import { describe, expect, it } from "vitest";

import { shouldSubmitComposerOnEnter } from "./composerKeyBehavior";

describe("shouldSubmitComposerOnEnter", () => {
  it("returns true for Enter on desktop", () => {
    expect(
      shouldSubmitComposerOnEnter({
        isMobileViewport: false,
        shiftKey: false,
        canDispatch: true,
      }),
    ).toBe(true);
  });

  it("returns false for Shift+Enter on desktop", () => {
    expect(
      shouldSubmitComposerOnEnter({
        isMobileViewport: false,
        shiftKey: true,
        canDispatch: true,
      }),
    ).toBe(false);
  });

  it("returns false for Enter on mobile", () => {
    expect(
      shouldSubmitComposerOnEnter({
        isMobileViewport: true,
        shiftKey: false,
        canDispatch: true,
      }),
    ).toBe(false);
  });

  it("returns false when dispatch is not available", () => {
    expect(
      shouldSubmitComposerOnEnter({
        isMobileViewport: false,
        shiftKey: false,
        canDispatch: false,
      }),
    ).toBe(false);
  });

  it("returns true when queueing is available during a running turn", () => {
    expect(
      shouldSubmitComposerOnEnter({
        isMobileViewport: false,
        shiftKey: false,
        canDispatch: true,
      }),
    ).toBe(true);
  });
});
