import { afterEach, assert, describe, it, vi } from "vitest";

import { copyTextToClipboard } from "./clipboard";

const originalNavigator = globalThis.navigator;
const originalDocument = globalThis.document;

afterEach(() => {
  vi.restoreAllMocks();

  if (originalNavigator === undefined) {
    Reflect.deleteProperty(globalThis, "navigator");
  } else {
    Object.defineProperty(globalThis, "navigator", {
      value: originalNavigator,
      configurable: true,
    });
  }

  if (originalDocument === undefined) {
    Reflect.deleteProperty(globalThis, "document");
  } else {
    Object.defineProperty(globalThis, "document", {
      value: originalDocument,
      configurable: true,
    });
  }
});

describe("copyTextToClipboard", () => {
  it("uses the Clipboard API when available", async () => {
    const writeText = vi.fn<(_: string) => Promise<void>>().mockResolvedValue(undefined);

    Object.defineProperty(globalThis, "navigator", {
      value: { clipboard: { writeText } },
      configurable: true,
    });

    await copyTextToClipboard("hello");

    assert.equal(writeText.mock.calls.length, 1);
    assert.deepEqual(writeText.mock.calls[0], ["hello"]);
  });

  it("falls back to execCommand when Clipboard API writes fail", async () => {
    const writeText = vi.fn<(_: string) => Promise<void>>().mockRejectedValue(new Error("denied"));
    const focusActiveElement = vi.fn();
    const focusTextarea = vi.fn();
    const selectTextarea = vi.fn();
    const setSelectionRange = vi.fn();
    const removeTextarea = vi.fn();
    const append = vi.fn();
    const execCommand = vi.fn<(command: string) => boolean>().mockReturnValue(true);
    const textarea = {
      value: "",
      style: {},
      setAttribute: vi.fn(),
      focus: focusTextarea,
      select: selectTextarea,
      setSelectionRange,
      remove: removeTextarea,
    };

    Object.defineProperty(globalThis, "navigator", {
      value: { clipboard: { writeText } },
      configurable: true,
    });
    Object.defineProperty(globalThis, "document", {
      value: {
        body: { append },
        activeElement: { focus: focusActiveElement },
        createElement: vi.fn<(tag: string) => unknown>().mockReturnValue(textarea),
        execCommand,
      },
      configurable: true,
    });

    await copyTextToClipboard("fallback");

    assert.equal(writeText.mock.calls.length, 1);
    assert.equal(execCommand.mock.calls.length, 1);
    assert.deepEqual(execCommand.mock.calls[0], ["copy"]);
    assert.equal(append.mock.calls.length, 1);
    assert.equal(textarea.value, "fallback");
    assert.equal(selectTextarea.mock.calls.length, 1);
    assert.deepEqual(setSelectionRange.mock.calls[0], [0, "fallback".length]);
    assert.equal(removeTextarea.mock.calls.length, 1);
    assert.equal(focusActiveElement.mock.calls.length, 1);
  });

  it("throws when no clipboard strategy succeeds", async () => {
    Object.defineProperty(globalThis, "navigator", {
      value: {},
      configurable: true,
    });
    Object.defineProperty(globalThis, "document", {
      value: { body: null },
      configurable: true,
    });

    try {
      await copyTextToClipboard("nope");
      assert.fail("Expected clipboard copy to fail.");
    } catch (error) {
      assert.match(String(error), /Clipboard write failed/);
    }
  });
});
