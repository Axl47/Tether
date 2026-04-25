import { describe, expect, it } from "vitest";

import { shouldApplyControlledOpenChange } from "./controlledOpenState";

describe("shouldApplyControlledOpenChange", () => {
  it("ignores no-op controlled open sync", () => {
    expect(shouldApplyControlledOpenChange(false, false)).toBe(false);
    expect(shouldApplyControlledOpenChange(true, true)).toBe(false);
  });

  it("accepts real open state changes", () => {
    expect(shouldApplyControlledOpenChange(false, true)).toBe(true);
    expect(shouldApplyControlledOpenChange(true, false)).toBe(true);
  });
});
