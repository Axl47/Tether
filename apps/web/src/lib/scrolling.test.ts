import { describe, expect, it } from "vitest";

import { canScrollElementForDelta } from "./scrolling";

describe("canScrollElementForDelta", () => {
  it("allows upward wheel events while the nested scroller is above the top", () => {
    expect(
      canScrollElementForDelta(
        {
          scrollHeight: 600,
          clientHeight: 200,
          scrollTop: 120,
        },
        -180,
      ),
    ).toBe(true);
  });

  it("allows downward wheel events while the nested scroller is below the bottom", () => {
    expect(
      canScrollElementForDelta(
        {
          scrollHeight: 600,
          clientHeight: 200,
          scrollTop: 120,
        },
        180,
      ),
    ).toBe(true);
  });

  it("falls back to the parent scroller when the nested scroller is already at the edge", () => {
    expect(
      canScrollElementForDelta(
        {
          scrollHeight: 600,
          clientHeight: 200,
          scrollTop: 0,
        },
        -180,
      ),
    ).toBe(false);
    expect(
      canScrollElementForDelta(
        {
          scrollHeight: 600,
          clientHeight: 200,
          scrollTop: 400,
        },
        180,
      ),
    ).toBe(false);
  });

  it("ignores tiny deltas and non-overflowing elements", () => {
    expect(
      canScrollElementForDelta(
        {
          scrollHeight: 200,
          clientHeight: 200,
          scrollTop: 0,
        },
        180,
      ),
    ).toBe(false);
    expect(
      canScrollElementForDelta(
        {
          scrollHeight: 600,
          clientHeight: 200,
          scrollTop: 120,
        },
        0.4,
      ),
    ).toBe(false);
  });
});
