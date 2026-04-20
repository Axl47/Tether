import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vitest";

import {
  getLatestStartedThreadSelection,
  inferProviderForThreadModel,
} from "./threadSelectionDefaults";
import { DEFAULT_INTERACTION_MODE, DEFAULT_RUNTIME_MODE, type Thread } from "./types";

const ENVIRONMENT_ID = EnvironmentId.make("environment-local");

function makeThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: ThreadId.makeUnsafe("thread-1"),
    environmentId: ENVIRONMENT_ID,
    codexThreadId: null,
    projectId: ProjectId.makeUnsafe("project-1"),
    title: "Thread",
    modelSelection: {
      provider: "codex",
      model: "gpt-5.4",
    },
    model: "gpt-5.4",
    runtimeMode: DEFAULT_RUNTIME_MODE,
    interactionMode: DEFAULT_INTERACTION_MODE,
    session: null,
    messages: [],
    proposedPlans: [],
    error: null,
    createdAt: "2026-03-01T00:00:00.000Z",
    archivedAt: null,
    updatedAt: "2026-03-01T00:00:00.000Z",
    latestTurn: null,
    branch: null,
    worktreePath: null,
    contextWindow: null,
    turnDiffSummaries: [],
    activities: [],
    ...overrides,
  };
}

describe("inferProviderForThreadModel", () => {
  it("prefers the active session provider when one exists", () => {
    expect(
      inferProviderForThreadModel({
        model: "gpt-5.4",
        sessionProviderName: "gemini",
      }),
    ).toBe("gemini");
  });

  it("infers Claude provider models without requiring a session", () => {
    expect(
      inferProviderForThreadModel({
        model: "claude-opus-4-6",
        sessionProviderName: null,
      }),
    ).toBe("claudeAgent");
  });
});

describe("getLatestStartedThreadSelection", () => {
  it("returns null when there are no started threads", () => {
    expect(getLatestStartedThreadSelection([])).toBeNull();
  });

  it("uses the newest started thread's provider and model", () => {
    const selection = getLatestStartedThreadSelection([
      makeThread({
        id: ThreadId.makeUnsafe("thread-old"),
        createdAt: "2026-03-01T00:00:00.000Z",
        modelSelection: {
          provider: "codex",
          model: "gpt-5.3-codex",
        },
        model: "gpt-5.3-codex",
      }),
      makeThread({
        id: ThreadId.makeUnsafe("thread-new"),
        createdAt: "2026-03-05T00:00:00.000Z",
        modelSelection: {
          provider: "claudeAgent",
          model: "claude-opus-4-6",
        },
        model: "claude-opus-4-6",
      }),
    ]);

    expect(selection).toEqual({
      provider: "claudeAgent",
      model: "claude-opus-4-6",
    });
  });

  it("normalizes the latest thread model for its provider", () => {
    const selection = getLatestStartedThreadSelection([
      makeThread({
        id: ThreadId.makeUnsafe("thread-new"),
        createdAt: "2026-03-05T00:00:00.000Z",
        modelSelection: {
          provider: "codex",
          model: "5.3",
        },
        model: "5.3",
      }),
    ]);

    expect(selection).toEqual({
      provider: "codex",
      model: "gpt-5.3-codex",
    });
  });
});
