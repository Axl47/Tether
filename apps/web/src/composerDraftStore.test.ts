import { ProjectId, ThreadId } from "@t3tools/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createJSONStorage } from "zustand/middleware";

import {
  COMPOSER_DRAFT_STORAGE_KEY,
  type ComposerImageAttachment,
  createDebouncedStorage,
  useComposerDraftStore,
} from "./composerDraftStore";

const memoryStorage = new Map<string, string>();
const localStorageMock = {
  get length() {
    return memoryStorage.size;
  },
  getItem: vi.fn((key: string) => memoryStorage.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => {
    memoryStorage.set(key, value);
  }),
  removeItem: vi.fn((key: string) => {
    memoryStorage.delete(key);
  }),
  key: vi.fn((index: number) => Array.from(memoryStorage.keys())[index] ?? null),
  clear: vi.fn(() => {
    memoryStorage.clear();
  }),
};

vi.stubGlobal("localStorage", localStorageMock);
useComposerDraftStore.persist.setOptions({
  storage: createJSONStorage(() => localStorageMock),
});

function makeImage(input: {
  id: string;
  previewUrl: string;
  name?: string;
  mimeType?: string;
  sizeBytes?: number;
  lastModified?: number;
}): ComposerImageAttachment {
  const name = input.name ?? "image.png";
  const mimeType = input.mimeType ?? "image/png";
  const sizeBytes = input.sizeBytes ?? 4;
  const lastModified = input.lastModified ?? 1_700_000_000_000;
  const file = new File([new Uint8Array(sizeBytes).fill(1)], name, {
    type: mimeType,
    lastModified,
  });
  return {
    type: "image",
    id: input.id,
    name,
    mimeType,
    sizeBytes: file.size,
    previewUrl: input.previewUrl,
    file,
  };
}

beforeEach(() => {
  memoryStorage.clear();
  localStorageMock.getItem.mockClear();
  localStorageMock.setItem.mockClear();
  localStorageMock.removeItem.mockClear();
  localStorageMock.clear.mockClear();
});

describe("composerDraftStore addImages", () => {
  const threadId = ThreadId.makeUnsafe("thread-dedupe");
  let originalRevokeObjectUrl: typeof URL.revokeObjectURL;
  let revokeSpy: ReturnType<typeof vi.fn<(url: string) => void>>;

  beforeEach(() => {
    useComposerDraftStore.setState({
      draftsByThreadId: {},
      queuedMessagesByThreadId: {},
      draftThreadsByThreadId: {},
      projectDraftThreadIdByProjectId: {},
    });
    originalRevokeObjectUrl = URL.revokeObjectURL;
    revokeSpy = vi.fn();
    URL.revokeObjectURL = revokeSpy;
  });

  afterEach(() => {
    URL.revokeObjectURL = originalRevokeObjectUrl;
  });

  it("deduplicates identical images in one batch by file signature", () => {
    const first = makeImage({
      id: "img-1",
      previewUrl: "blob:first",
      name: "same.png",
      mimeType: "image/png",
      sizeBytes: 12,
      lastModified: 12345,
    });
    const duplicate = makeImage({
      id: "img-2",
      previewUrl: "blob:duplicate",
      name: "same.png",
      mimeType: "image/png",
      sizeBytes: 12,
      lastModified: 12345,
    });

    useComposerDraftStore.getState().addImages(threadId, [first, duplicate]);

    const draft = useComposerDraftStore.getState().draftsByThreadId[threadId];
    expect(draft?.images.map((image) => image.id)).toEqual(["img-1"]);
    expect(revokeSpy).toHaveBeenCalledWith("blob:duplicate");
  });

  it("deduplicates against existing images across calls by file signature", () => {
    const first = makeImage({
      id: "img-a",
      previewUrl: "blob:a",
      name: "same.png",
      mimeType: "image/png",
      sizeBytes: 9,
      lastModified: 777,
    });
    const duplicateLater = makeImage({
      id: "img-b",
      previewUrl: "blob:b",
      name: "same.png",
      mimeType: "image/png",
      sizeBytes: 9,
      lastModified: 999,
    });

    useComposerDraftStore.getState().addImage(threadId, first);
    useComposerDraftStore.getState().addImage(threadId, duplicateLater);

    const draft = useComposerDraftStore.getState().draftsByThreadId[threadId];
    expect(draft?.images.map((image) => image.id)).toEqual(["img-a"]);
    expect(revokeSpy).toHaveBeenCalledWith("blob:b");
  });

  it("does not revoke blob URLs that are still used by an accepted duplicate image", () => {
    const first = makeImage({
      id: "img-shared",
      previewUrl: "blob:shared",
    });
    const duplicateSameUrl = makeImage({
      id: "img-shared",
      previewUrl: "blob:shared",
    });

    useComposerDraftStore.getState().addImages(threadId, [first, duplicateSameUrl]);

    const draft = useComposerDraftStore.getState().draftsByThreadId[threadId];
    expect(draft?.images.map((image) => image.id)).toEqual(["img-shared"]);
    expect(revokeSpy).not.toHaveBeenCalledWith("blob:shared");
  });
});

describe("composerDraftStore clearComposerContent", () => {
  const threadId = ThreadId.makeUnsafe("thread-clear");
  let originalRevokeObjectUrl: typeof URL.revokeObjectURL;
  let revokeSpy: ReturnType<typeof vi.fn<(url: string) => void>>;

  beforeEach(() => {
    useComposerDraftStore.setState({
      draftsByThreadId: {},
      queuedMessagesByThreadId: {},
      draftThreadsByThreadId: {},
      projectDraftThreadIdByProjectId: {},
    });
    originalRevokeObjectUrl = URL.revokeObjectURL;
    revokeSpy = vi.fn();
    URL.revokeObjectURL = revokeSpy;
  });

  afterEach(() => {
    URL.revokeObjectURL = originalRevokeObjectUrl;
  });

  it("does not revoke blob preview URLs when clearing composer content", () => {
    const first = makeImage({
      id: "img-optimistic",
      previewUrl: "blob:optimistic",
    });
    useComposerDraftStore.getState().addImage(threadId, first);

    useComposerDraftStore.getState().clearComposerContent(threadId);

    const draft = useComposerDraftStore.getState().draftsByThreadId[threadId];
    expect(draft).toBeUndefined();
    expect(revokeSpy).not.toHaveBeenCalledWith("blob:optimistic");
  });
});

describe("composerDraftStore project draft thread mapping", () => {
  const projectId = ProjectId.makeUnsafe("project-a");
  const otherProjectId = ProjectId.makeUnsafe("project-b");
  const threadId = ThreadId.makeUnsafe("thread-a");
  const otherThreadId = ThreadId.makeUnsafe("thread-b");

  beforeEach(() => {
    useComposerDraftStore.setState({
      draftsByThreadId: {},
      queuedMessagesByThreadId: {},
      draftThreadsByThreadId: {},
      projectDraftThreadIdByProjectId: {},
    });
  });

  it("stores and reads project draft thread ids via actions", () => {
    const store = useComposerDraftStore.getState();
    expect(store.getDraftThreadByProjectId(projectId)).toBeNull();
    expect(store.getDraftThread(threadId)).toBeNull();

    store.setProjectDraftThreadId(projectId, threadId, {
      branch: "feature/test",
      worktreePath: "/tmp/worktree-test",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(useComposerDraftStore.getState().getDraftThreadByProjectId(projectId)).toEqual({
      threadId,
      projectId,
      branch: "feature/test",
      worktreePath: "/tmp/worktree-test",
      envMode: "worktree",
      runtimeMode: "full-access",
      interactionMode: "default",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(useComposerDraftStore.getState().getDraftThread(threadId)).toEqual({
      projectId,
      branch: "feature/test",
      worktreePath: "/tmp/worktree-test",
      envMode: "worktree",
      runtimeMode: "full-access",
      interactionMode: "default",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("clears only matching project draft mapping entries", () => {
    const store = useComposerDraftStore.getState();
    store.setProjectDraftThreadId(projectId, threadId);
    store.setPrompt(threadId, "hello");

    store.clearProjectDraftThreadById(projectId, otherThreadId);
    expect(useComposerDraftStore.getState().getDraftThreadByProjectId(projectId)?.threadId).toBe(
      threadId,
    );

    store.clearProjectDraftThreadById(projectId, threadId);
    expect(useComposerDraftStore.getState().getDraftThreadByProjectId(projectId)).toBeNull();
    expect(useComposerDraftStore.getState().getDraftThread(threadId)).not.toBeNull();
    expect(useComposerDraftStore.getState().draftsByThreadId[threadId]?.prompt).toBe("hello");
  });

  it("clears project draft mapping by project id", () => {
    const store = useComposerDraftStore.getState();
    store.setProjectDraftThreadId(projectId, threadId);
    store.setPrompt(threadId, "hello");
    store.clearProjectDraftThreadId(projectId);
    expect(useComposerDraftStore.getState().getDraftThreadByProjectId(projectId)).toBeNull();
    expect(useComposerDraftStore.getState().getDraftThread(threadId)).not.toBeNull();
    expect(useComposerDraftStore.getState().draftsByThreadId[threadId]?.prompt).toBe("hello");
  });

  it("preserves older drafts when remapping a project to a new draft thread", () => {
    const store = useComposerDraftStore.getState();
    store.setProjectDraftThreadId(projectId, threadId);
    store.setPrompt(threadId, "orphan me");

    store.setProjectDraftThreadId(projectId, otherThreadId);

    expect(useComposerDraftStore.getState().getDraftThreadByProjectId(projectId)?.threadId).toBe(
      otherThreadId,
    );
    expect(useComposerDraftStore.getState().getDraftThread(threadId)).not.toBeNull();
    expect(useComposerDraftStore.getState().draftsByThreadId[threadId]?.prompt).toBe("orphan me");
  });

  it("keeps composer drafts when the thread is still mapped by another project", () => {
    const store = useComposerDraftStore.getState();
    store.setProjectDraftThreadId(projectId, threadId);
    store.setProjectDraftThreadId(otherProjectId, threadId);
    store.setPrompt(threadId, "keep me");

    store.clearProjectDraftThreadId(projectId);

    expect(useComposerDraftStore.getState().getDraftThreadByProjectId(projectId)).toBeNull();
    expect(
      useComposerDraftStore.getState().getDraftThreadByProjectId(otherProjectId)?.threadId,
    ).toBe(threadId);
    expect(useComposerDraftStore.getState().draftsByThreadId[threadId]?.prompt).toBe("keep me");
  });

  it("clears draft registration independently", () => {
    const store = useComposerDraftStore.getState();
    store.setProjectDraftThreadId(projectId, threadId);
    store.clearDraftThread(threadId);
    expect(useComposerDraftStore.getState().getDraftThreadByProjectId(projectId)).toBeNull();
    expect(useComposerDraftStore.getState().getDraftThread(threadId)).toBeNull();
  });

  it("updates branch context on an existing draft thread", () => {
    const store = useComposerDraftStore.getState();
    store.setProjectDraftThreadId(projectId, threadId, {
      branch: "main",
      worktreePath: null,
    });
    store.setDraftThreadContext(threadId, {
      branch: "feature/next",
      worktreePath: "/tmp/feature-next",
    });
    expect(useComposerDraftStore.getState().getDraftThreadByProjectId(projectId)?.threadId).toBe(
      threadId,
    );
    expect(useComposerDraftStore.getState().getDraftThread(threadId)).toMatchObject({
      projectId,
      branch: "feature/next",
      worktreePath: "/tmp/feature-next",
      envMode: "worktree",
    });
  });

  it("preserves existing branch and worktree when setProjectDraftThreadId receives undefined", () => {
    const store = useComposerDraftStore.getState();
    store.setProjectDraftThreadId(projectId, threadId, {
      branch: "main",
      worktreePath: "/tmp/main-worktree",
    });
    const runtimeUndefinedOptions = {
      branch: undefined,
      worktreePath: undefined,
    } as unknown as {
      branch?: string | null;
      worktreePath?: string | null;
    };
    store.setProjectDraftThreadId(projectId, threadId, runtimeUndefinedOptions);

    expect(useComposerDraftStore.getState().getDraftThread(threadId)).toMatchObject({
      projectId,
      branch: "main",
      worktreePath: "/tmp/main-worktree",
      envMode: "worktree",
    });
  });

  it("preserves worktree env mode without a worktree path", () => {
    const store = useComposerDraftStore.getState();
    store.setProjectDraftThreadId(projectId, threadId, {
      branch: "feature/base",
      worktreePath: null,
      envMode: "worktree",
    });
    const runtimeUndefinedOptions = {
      branch: undefined,
      worktreePath: undefined,
      envMode: undefined,
    } as unknown as {
      branch?: string | null;
      worktreePath?: string | null;
      envMode?: "local" | "worktree";
    };
    store.setProjectDraftThreadId(projectId, threadId, runtimeUndefinedOptions);

    expect(useComposerDraftStore.getState().getDraftThread(threadId)).toMatchObject({
      projectId,
      branch: "feature/base",
      worktreePath: null,
      envMode: "worktree",
    });
  });
});

describe("composerDraftStore codex fast mode", () => {
  const threadId = ThreadId.makeUnsafe("thread-service-tier");

  beforeEach(() => {
    useComposerDraftStore.setState({
      draftsByThreadId: {},
      queuedMessagesByThreadId: {},
      draftThreadsByThreadId: {},
      projectDraftThreadIdByProjectId: {},
    });
  });

  it("stores codex fast mode in the draft", () => {
    const store = useComposerDraftStore.getState();
    store.setCodexFastMode(threadId, true);

    expect(useComposerDraftStore.getState().draftsByThreadId[threadId]?.codexFastMode).toBe(true);
  });

  it("clears codex fast mode when reset to the default", () => {
    const store = useComposerDraftStore.getState();
    store.setCodexFastMode(threadId, true);
    store.setCodexFastMode(threadId, false);

    expect(useComposerDraftStore.getState().draftsByThreadId[threadId]).toBeUndefined();
  });
});

describe("composerDraftStore setModel", () => {
  const threadId = ThreadId.makeUnsafe("thread-model");

  beforeEach(() => {
    useComposerDraftStore.setState({
      draftsByThreadId: {},
      queuedMessagesByThreadId: {},
      draftThreadsByThreadId: {},
      projectDraftThreadIdByProjectId: {},
    });
  });

  it("keeps explicit DEFAULT_MODEL overrides instead of coercing to null", () => {
    const store = useComposerDraftStore.getState();

    store.setModel(threadId, "gpt-5.3-codex");

    expect(useComposerDraftStore.getState().draftsByThreadId[threadId]?.model).toBe(
      "gpt-5.3-codex",
    );
  });
});

describe("composerDraftStore setProvider", () => {
  const threadId = ThreadId.makeUnsafe("thread-provider");

  beforeEach(() => {
    useComposerDraftStore.setState({
      draftsByThreadId: {},
      queuedMessagesByThreadId: {},
      draftThreadsByThreadId: {},
      projectDraftThreadIdByProjectId: {},
    });
  });

  it("persists provider-only selection even when prompt/model are empty", () => {
    const store = useComposerDraftStore.getState();

    store.setProvider(threadId, "codex");

    expect(useComposerDraftStore.getState().draftsByThreadId[threadId]?.provider).toBe("codex");
  });

  it("removes empty provider-only draft when provider is reset", () => {
    const store = useComposerDraftStore.getState();

    store.setProvider(threadId, "codex");
    store.setProvider(threadId, null);

    expect(useComposerDraftStore.getState().draftsByThreadId[threadId]).toBeUndefined();
  });
});

describe("composerDraftStore runtime and interaction settings", () => {
  const threadId = ThreadId.makeUnsafe("thread-settings");

  beforeEach(() => {
    useComposerDraftStore.setState({
      draftsByThreadId: {},
      queuedMessagesByThreadId: {},
      draftThreadsByThreadId: {},
      projectDraftThreadIdByProjectId: {},
    });
  });

  it("stores runtime mode overrides in the composer draft", () => {
    const store = useComposerDraftStore.getState();

    store.setRuntimeMode(threadId, "approval-required");

    expect(useComposerDraftStore.getState().draftsByThreadId[threadId]?.runtimeMode).toBe(
      "approval-required",
    );
  });

  it("stores interaction mode overrides in the composer draft", () => {
    const store = useComposerDraftStore.getState();

    store.setInteractionMode(threadId, "plan");

    expect(useComposerDraftStore.getState().draftsByThreadId[threadId]?.interactionMode).toBe(
      "plan",
    );
  });

  it("removes empty settings-only drafts when overrides are cleared", () => {
    const store = useComposerDraftStore.getState();

    store.setRuntimeMode(threadId, "approval-required");
    store.setInteractionMode(threadId, "plan");
    store.setRuntimeMode(threadId, null);
    store.setInteractionMode(threadId, null);

    expect(useComposerDraftStore.getState().draftsByThreadId[threadId]).toBeUndefined();
  });
});

describe("composerDraftStore queued messages", () => {
  const threadId = ThreadId.makeUnsafe("thread-queued");
  const otherThreadId = ThreadId.makeUnsafe("thread-queued-other");
  const projectId = ProjectId.makeUnsafe("project-queued");

  beforeEach(() => {
    localStorage.clear();
    useComposerDraftStore.setState({
      draftsByThreadId: {},
      queuedMessagesByThreadId: {},
      draftThreadsByThreadId: {},
      projectDraftThreadIdByProjectId: {},
    });
  });

  it("keeps queued messages in FIFO order and can promote items to the head", () => {
    const store = useComposerDraftStore.getState();

    store.enqueueQueuedMessage(threadId, {
      id: "queued-1",
      createdAt: "2026-03-08T00:00:00.000Z",
      prompt: "first",
      images: [],
      nonPersistedImageIds: [],
      provider: "codex",
      model: "gpt-5.4",
      runtimeMode: "full-access",
      interactionMode: "default",
      effort: null,
      codexFastMode: false,
    });
    store.enqueueQueuedMessage(threadId, {
      id: "queued-2",
      createdAt: "2026-03-08T00:00:01.000Z",
      prompt: "second",
      images: [],
      nonPersistedImageIds: [],
      provider: "codex",
      model: "gpt-5.4",
      runtimeMode: "full-access",
      interactionMode: "default",
      effort: null,
      codexFastMode: false,
    });

    expect(
      useComposerDraftStore.getState().queuedMessagesByThreadId[threadId]?.map((entry) => entry.id),
    ).toEqual(["queued-1", "queued-2"]);

    store.promoteQueuedMessage(threadId, "queued-2");

    expect(
      useComposerDraftStore.getState().queuedMessagesByThreadId[threadId]?.map((entry) => entry.id),
    ).toEqual(["queued-2", "queued-1"]);
  });

  it("moves queued messages to an arbitrary position without affecting other threads", () => {
    const store = useComposerDraftStore.getState();

    for (const [id, prompt] of [
      ["queued-1", "first"],
      ["queued-2", "second"],
      ["queued-3", "third"],
    ] as const) {
      store.enqueueQueuedMessage(threadId, {
        id,
        createdAt: "2026-03-08T00:00:00.000Z",
        prompt,
        images: [],
        nonPersistedImageIds: [],
        provider: "codex",
        model: "gpt-5.4",
        runtimeMode: "full-access",
        interactionMode: "default",
        effort: null,
        codexFastMode: false,
      });
    }

    store.enqueueQueuedMessage(otherThreadId, {
      id: "queued-other",
      createdAt: "2026-03-08T00:00:03.000Z",
      prompt: "other",
      images: [],
      nonPersistedImageIds: [],
      provider: "codex",
      model: "gpt-5.4",
      runtimeMode: "full-access",
      interactionMode: "default",
      effort: null,
      codexFastMode: false,
    });

    store.moveQueuedMessage(threadId, 2, 0);

    expect(
      useComposerDraftStore.getState().queuedMessagesByThreadId[threadId]?.map((entry) => entry.id),
    ).toEqual(["queued-3", "queued-1", "queued-2"]);
    expect(
      useComposerDraftStore
        .getState()
        .queuedMessagesByThreadId[otherThreadId]?.map((entry) => entry.id),
    ).toEqual(["queued-other"]);
  });

  it("loads a queued message into the composer and swaps existing sendable content back into place", () => {
    const store = useComposerDraftStore.getState();
    store.setPrompt(threadId, "composer draft");
    store.enqueueQueuedMessage(threadId, {
      id: "queued-edit",
      createdAt: "2026-03-08T00:00:00.000Z",
      prompt: "queued follow-up",
      images: [],
      nonPersistedImageIds: [],
      provider: "codex",
      model: "gpt-5.4",
      runtimeMode: "approval-required",
      interactionMode: "plan",
      effort: null,
      codexFastMode: true,
    });

    store.loadQueuedMessageIntoComposer(threadId, "queued-edit", {
      swapComposerContent: true,
    });

    expect(useComposerDraftStore.getState().draftsByThreadId[threadId]).toMatchObject({
      prompt: "queued follow-up",
      runtimeMode: "approval-required",
      interactionMode: "plan",
      codexFastMode: true,
    });
    expect(useComposerDraftStore.getState().queuedMessagesByThreadId[threadId]?.[0]?.prompt).toBe(
      "composer draft",
    );
  });

  it("cleans queued messages when a project draft thread mapping is cleared or remapped", () => {
    const store = useComposerDraftStore.getState();
    store.setProjectDraftThreadId(projectId, threadId);
    store.enqueueQueuedMessage(threadId, {
      id: "queued-cleanup",
      createdAt: "2026-03-08T00:00:00.000Z",
      prompt: "queued",
      images: [],
      nonPersistedImageIds: [],
      provider: "codex",
      model: "gpt-5.4",
      runtimeMode: "full-access",
      interactionMode: "default",
      effort: null,
      codexFastMode: false,
    });

    store.setProjectDraftThreadId(projectId, otherThreadId);
    expect(useComposerDraftStore.getState().queuedMessagesByThreadId[threadId]).toBeUndefined();

    store.enqueueQueuedMessage(otherThreadId, {
      id: "queued-cleanup-2",
      createdAt: "2026-03-08T00:00:01.000Z",
      prompt: "queued two",
      images: [],
      nonPersistedImageIds: [],
      provider: "codex",
      model: "gpt-5.4",
      runtimeMode: "full-access",
      interactionMode: "default",
      effort: null,
      codexFastMode: false,
    });
    store.clearProjectDraftThreadId(projectId);

    expect(
      useComposerDraftStore.getState().queuedMessagesByThreadId[otherThreadId],
    ).toBeUndefined();
  });

  it("persists queued messages to storage and rehydrates them", async () => {
    const store = useComposerDraftStore.getState();
    const image = makeImage({
      id: "queued-image",
      previewUrl: "data:image/png;base64,AAAA",
      sizeBytes: 4,
    });

    store.enqueueQueuedMessage(threadId, {
      id: "queued-persisted",
      createdAt: "2026-03-08T00:00:00.000Z",
      prompt: "persist me",
      images: [image],
      nonPersistedImageIds: [],
      persistedAttachments: [
        {
          id: "queued-image",
          name: image.name,
          mimeType: image.mimeType,
          sizeBytes: image.sizeBytes,
          dataUrl: "data:image/png;base64,AAAA",
        },
      ],
      provider: "codex",
      model: "gpt-5.4",
      runtimeMode: "full-access",
      interactionMode: "default",
      effort: null,
      codexFastMode: false,
    });

    const raw = localStorage.getItem(COMPOSER_DRAFT_STORAGE_KEY);
    expect(raw).toContain("queued-persisted");

    useComposerDraftStore.setState({
      draftsByThreadId: {},
      queuedMessagesByThreadId: {},
      draftThreadsByThreadId: {},
      projectDraftThreadIdByProjectId: {},
    });
    localStorage.setItem(COMPOSER_DRAFT_STORAGE_KEY, raw as string);

    await useComposerDraftStore.persist.rehydrate();

    expect(useComposerDraftStore.getState().queuedMessagesByThreadId[threadId]?.[0]).toMatchObject({
      id: "queued-persisted",
      prompt: "persist me",
      persistedAttachments: [
        expect.objectContaining({
          id: "queued-image",
        }),
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// createDebouncedStorage
// ---------------------------------------------------------------------------

function createMockStorage() {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((name: string) => store.get(name) ?? null),
    setItem: vi.fn((name: string, value: string) => {
      store.set(name, value);
    }),
    removeItem: vi.fn((name: string) => {
      store.delete(name);
    }),
  };
}

describe("createDebouncedStorage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("delegates getItem immediately", () => {
    const base = createMockStorage();
    base.getItem.mockReturnValueOnce("value");
    const storage = createDebouncedStorage(base);

    expect(storage.getItem("key")).toBe("value");
    expect(base.getItem).toHaveBeenCalledWith("key");
  });

  it("does not write to base storage until the debounce fires", () => {
    const base = createMockStorage();
    const storage = createDebouncedStorage(base);

    storage.setItem("key", "v1");
    expect(base.setItem).not.toHaveBeenCalled();

    vi.advanceTimersByTime(299);
    expect(base.setItem).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(base.setItem).toHaveBeenCalledWith("key", "v1");
  });

  it("only writes the last value when setItem is called rapidly", () => {
    const base = createMockStorage();
    const storage = createDebouncedStorage(base);

    storage.setItem("key", "v1");
    storage.setItem("key", "v2");
    storage.setItem("key", "v3");

    vi.advanceTimersByTime(300);
    expect(base.setItem).toHaveBeenCalledTimes(1);
    expect(base.setItem).toHaveBeenCalledWith("key", "v3");
  });

  it("removeItem cancels a pending setItem write", () => {
    const base = createMockStorage();
    const storage = createDebouncedStorage(base);

    storage.setItem("key", "v1");
    storage.removeItem("key");

    vi.advanceTimersByTime(300);
    expect(base.setItem).not.toHaveBeenCalled();
    expect(base.removeItem).toHaveBeenCalledWith("key");
  });

  it("flush writes the pending value immediately", () => {
    const base = createMockStorage();
    const storage = createDebouncedStorage(base);

    storage.setItem("key", "v1");
    expect(base.setItem).not.toHaveBeenCalled();

    storage.flush();
    expect(base.setItem).toHaveBeenCalledWith("key", "v1");

    // Timer should be cancelled; no duplicate write.
    vi.advanceTimersByTime(300);
    expect(base.setItem).toHaveBeenCalledTimes(1);
  });

  it("flush is a no-op when nothing is pending", () => {
    const base = createMockStorage();
    const storage = createDebouncedStorage(base);

    storage.flush();
    expect(base.setItem).not.toHaveBeenCalled();
  });

  it("flush after removeItem is a no-op", () => {
    const base = createMockStorage();
    const storage = createDebouncedStorage(base);

    storage.setItem("key", "v1");
    storage.removeItem("key");
    storage.flush();

    expect(base.setItem).not.toHaveBeenCalled();
  });

  it("setItem works normally after removeItem cancels a pending write", () => {
    const base = createMockStorage();
    const storage = createDebouncedStorage(base);

    storage.setItem("key", "v1");
    storage.removeItem("key");
    storage.setItem("key", "v2");

    vi.advanceTimersByTime(300);
    expect(base.setItem).toHaveBeenCalledTimes(1);
    expect(base.setItem).toHaveBeenCalledWith("key", "v2");
  });
});
