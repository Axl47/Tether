import { describe, expect, it } from "vitest";

import { shouldSubmitComposerOnEnter } from "./composerKeyBehavior";

describe("shouldSubmitComposerOnEnter", () => {
  it("returns true for Enter on desktop", () => {
    expect(
      shouldSubmitComposerOnEnter({
        isMobileViewport: false,
        shiftKey: false,
        canSubmit: true,
      }),
    ).toBe(true);
  });

  it("returns false for Shift+Enter on desktop", () => {
    expect(
      shouldSubmitComposerOnEnter({
        isMobileViewport: false,
        shiftKey: true,
        canSubmit: true,
      }),
    ).toBe(false);
  });

  it("returns false for Enter on mobile", () => {
    expect(
      shouldSubmitComposerOnEnter({
        isMobileViewport: true,
        shiftKey: false,
        canSubmit: true,
      }),
    ).toBe(false);
  });

  it("returns false when submission is not available", () => {
    expect(
      shouldSubmitComposerOnEnter({
        isMobileViewport: false,
        shiftKey: false,
        canSubmit: false,
      }),
    ).toBe(false);
  });
});
