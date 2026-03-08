import { assert, describe, it } from "vitest";

import { readPersistedSidebarOpenState } from "./sidebar.logic";

describe("readPersistedSidebarOpenState", () => {
  it("prefers local storage when a provider storage key is configured", () => {
    assert.equal(
      readPersistedSidebarOpenState({
        cookieString: "sidebar_state=false",
        defaultOpen: true,
        storage: {
          getItem: (key) => (key === "sidebar:left" ? "true" : null),
        },
        storageKey: "sidebar:left",
      }),
      true,
    );
  });

  it("falls back to the provided default when the sidebar cookie is absent", () => {
    assert.equal(
      readPersistedSidebarOpenState({
        cookieString: "theme=dark",
        defaultOpen: true,
        storage: null,
        storageKey: "sidebar:left",
      }),
      true,
    );
    assert.equal(
      readPersistedSidebarOpenState({
        cookieString: "theme=dark",
        defaultOpen: false,
        storage: null,
        storageKey: "sidebar:left",
      }),
      false,
    );
  });

  it("falls back to the legacy cookie when local storage is empty", () => {
    assert.equal(
      readPersistedSidebarOpenState({
        cookieString: "theme=dark; sidebar_state=true; other=value",
        defaultOpen: false,
        storage: {
          getItem: () => null,
        },
        storageKey: "sidebar:left",
      }),
      true,
    );
    assert.equal(
      readPersistedSidebarOpenState({
        cookieString: "theme=dark; sidebar_state=false; other=value",
        defaultOpen: true,
        storage: {
          getItem: () => null,
        },
        storageKey: "sidebar:left",
      }),
      false,
    );
  });

  it("ignores malformed sidebar cookie values", () => {
    assert.equal(
      readPersistedSidebarOpenState({
        cookieString: "sidebar_state=maybe",
        defaultOpen: true,
        storage: {
          getItem: () => null,
        },
        storageKey: "sidebar:left",
      }),
      true,
    );
    assert.equal(
      readPersistedSidebarOpenState({
        cookieString: "sidebar_state=maybe",
        defaultOpen: false,
        storage: {
          getItem: () => null,
        },
        storageKey: "sidebar:left",
      }),
      false,
    );
  });
});
