import { describe, expect, it } from "vitest";
import {
  CommandId,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  ProjectId,
  ThreadId,
  type OrchestrationReadModel,
} from "@t3tools/contracts";
import { Effect } from "effect";

import { decideOrchestrationCommand } from "./decider.ts";

const NOW = "2026-03-07T00:00:00.000Z";

const readModel: OrchestrationReadModel = {
  snapshotSequence: 1,
  updatedAt: NOW,
  projects: [
    {
      id: ProjectId.makeUnsafe("project-1"),
      title: "Project",
      workspaceRoot: "/tmp/project",
      defaultModel: "gpt-5-codex",
      scripts: [],
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
    },
  ],
  threads: [
    {
      id: ThreadId.makeUnsafe("thread-1"),
      projectId: ProjectId.makeUnsafe("project-1"),
      title: "Thread",
      model: "gpt-5-codex",
      runtimeMode: "full-access",
      interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
      branch: null,
      worktreePath: null,
      latestTurn: null,
      lastAutoRenameUserMessageId: null,
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
      archivedAt: null,
      messages: [],
      proposedPlans: [],
      contextWindow: null,
      activities: [],
      checkpoints: [],
      session: null,
    },
  ],
};

describe("decideOrchestrationCommand", () => {
  it("emits thread.archived for archive commands", async () => {
    const event = await Effect.runPromise(
      decideOrchestrationCommand({
        command: {
          type: "thread.archive",
          commandId: CommandId.makeUnsafe("cmd-archive"),
          threadId: ThreadId.makeUnsafe("thread-1"),
        },
        readModel,
      }),
    );

    expect(Array.isArray(event)).toBe(false);
    expect(event).toMatchObject({
      type: "thread.archived",
      aggregateKind: "thread",
      aggregateId: "thread-1",
      payload: {
        threadId: "thread-1",
      },
    });
  });

  it("emits thread.unarchived for archived threads", async () => {
    const event = await Effect.runPromise(
      decideOrchestrationCommand({
        command: {
          type: "thread.unarchive",
          commandId: CommandId.makeUnsafe("cmd-unarchive"),
          threadId: ThreadId.makeUnsafe("thread-1"),
        },
        readModel: {
          ...readModel,
          threads: readModel.threads.map((thread) =>
            thread.id === ThreadId.makeUnsafe("thread-1")
              ? { ...thread, archivedAt: NOW }
              : thread,
          ),
        },
      }),
    );

    expect(Array.isArray(event)).toBe(false);
    expect(event).toMatchObject({
      type: "thread.unarchived",
      aggregateKind: "thread",
      aggregateId: "thread-1",
      payload: {
        threadId: "thread-1",
      },
    });
  });

  it("rejects archiving an already archived thread", async () => {
    await expect(
      Effect.runPromise(
        decideOrchestrationCommand({
          command: {
            type: "thread.archive",
            commandId: CommandId.makeUnsafe("cmd-archive-again"),
            threadId: ThreadId.makeUnsafe("thread-1"),
          },
          readModel: {
            ...readModel,
            threads: readModel.threads.map((thread) =>
              thread.id === ThreadId.makeUnsafe("thread-1")
                ? { ...thread, archivedAt: NOW }
                : thread,
            ),
          },
        }),
      ),
    ).rejects.toThrow("already archived");
  });

  it("rejects unarchiving a thread that is not archived", async () => {
    await expect(
      Effect.runPromise(
        decideOrchestrationCommand({
          command: {
            type: "thread.unarchive",
            commandId: CommandId.makeUnsafe("cmd-unarchive-missing"),
            threadId: ThreadId.makeUnsafe("thread-1"),
          },
          readModel,
        }),
      ),
    ).rejects.toThrow("is not archived");
  });

  it("emits thread.context-window-set for internal context updates", async () => {
    const event = await Effect.runPromise(
      decideOrchestrationCommand({
        command: {
          type: "thread.context-window.set",
          commandId: CommandId.makeUnsafe("cmd-context-window"),
          threadId: ThreadId.makeUnsafe("thread-1"),
          contextWindow: {
            provider: "codex",
            usedTokens: 119000,
            maxTokens: 258000,
            remainingTokens: 139000,
            usedPercent: 46,
            updatedAt: NOW,
          },
          createdAt: NOW,
        },
        readModel,
      }),
    );

    expect(Array.isArray(event)).toBe(false);
    expect(event).toMatchObject({
      type: "thread.context-window-set",
      aggregateKind: "thread",
      aggregateId: "thread-1",
      payload: {
        threadId: "thread-1",
        contextWindow: {
          provider: "codex",
          usedPercent: 46,
        },
      },
    });
  });
});
