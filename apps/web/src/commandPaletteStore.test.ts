import { beforeEach, describe, expect, it } from "vitest";

import { useCommandPaletteStore } from "./commandPaletteStore";

describe("commandPaletteStore", () => {
  beforeEach(() => {
    useCommandPaletteStore.setState({
      open: false,
      mode: "default",
      sourceThreadId: null,
      sourceLeafId: null,
      previewThreadId: null,
      previewLeafId: null,
      openIntent: null,
    });
  });

  it("keeps the same store snapshot when setOpen(false) is a no-op", () => {
    const firstState = useCommandPaletteStore.getState();

    useCommandPaletteStore.getState().setOpen(false);

    expect(useCommandPaletteStore.getState()).toBe(firstState);
  });
});
