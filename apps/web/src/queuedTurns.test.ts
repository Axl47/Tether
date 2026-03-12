import { EventId, ProjectId, ThreadId, TurnId } from "@t3tools/contracts";
import { describe, expect, it } from "vitest";

import { canAutoDispatchQueuedTurn, queuedMessagePreview } from "./queuedTurns";
import { type Thread } from "./types";

function makeThread(overrides?: Partial<Thread>): Thread {
  return {
    id: ThreadId.makeUnsafe("thread-1"),
    codexThreadId: "codex-thread-1",
    projectId: ProjectId.makeUnsafe("project-1"),
    title: "Thread",
    model: "gpt-5.4",
    runtimeMode: "full-access",
    interactionMode: "default",
    session: {
      provider: "codex",
      status: "ready",
      orchestrationStatus: "ready",
      createdAt: "2026-03-08T00:00:00.000Z",
      updatedAt: "2026-03-08T00:00:00.000Z",
    },
    messages: [],
    proposedPlans: [],
    error: null,
    createdAt: "2026-03-08T00:00:00.000Z",
    updatedAt: "2026-03-08T00:00:00.000Z",
    latestTurn: null,
    branch: null,
    worktreePath: null,
    turnDiffSummaries: [],
    activities: [],
    ...overrides,
  };
}

describe("queuedMessagePreview", () => {
  it("uses the trimmed prompt when available", () => {
    expect(
      queuedMessagePreview({
        prompt: "  Follow up on the failing browser test and patch it  ",
        persistedAttachments: [],
      }),
    ).toBe("Follow up on the failing browser test and patch it");
  });

  it("falls back to the first attachment name", () => {
    expect(
      queuedMessagePreview({
        prompt: "   ",
        persistedAttachments: [{ name: "diagram.png" }],
      }),
    ).toBe("Image: diagram.png");
  });
});

describe("canAutoDispatchQueuedTurn", () => {
  it("allows idle threads without blockers", () => {
    expect(
      canAutoDispatchQueuedTurn({
        thread: makeThread(),
        isConnecting: false,
        isRevertingCheckpoint: false,
        isLocalSendInFlight: false,
      }),
    ).toBe(true);
  });

  it("blocks running threads", () => {
    expect(
      canAutoDispatchQueuedTurn({
        thread: makeThread({
          session: {
            provider: "codex",
            status: "running",
            orchestrationStatus: "running",
            activeTurnId: TurnId.makeUnsafe("turn-1"),
            createdAt: "2026-03-08T00:00:00.000Z",
            updatedAt: "2026-03-08T00:00:00.000Z",
          },
        }),
        isConnecting: false,
        isRevertingCheckpoint: false,
        isLocalSendInFlight: false,
      }),
    ).toBe(false);
  });

  it("blocks pending structured user input", () => {
    expect(
      canAutoDispatchQueuedTurn({
        thread: makeThread({
          activities: [
            {
              id: EventId.makeUnsafe("activity-1"),
              turnId: null,
              tone: "approval",
              kind: "user-input.requested",
              summary: "User input requested",
              createdAt: "2026-03-08T00:00:10.000Z",
              payload: {
                requestId: "req-1",
                questions: [
                  {
                    id: "scope",
                    header: "Scope",
                    question: "Which scope?",
                    options: [{ label: "A", description: "Option A" }],
                  },
                ],
              },
            },
          ],
        }),
        isConnecting: false,
        isRevertingCheckpoint: false,
        isLocalSendInFlight: false,
      }),
    ).toBe(false);
  });
});
