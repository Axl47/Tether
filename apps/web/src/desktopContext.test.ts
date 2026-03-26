import { ProjectId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vitest";

import { deriveDesktopContextFromRoute } from "./desktopContext";
import type { Project, Thread } from "./types";

describe("deriveDesktopContextFromRoute", () => {
  it("returns the active project and thread from the current route", () => {
    const projects: Project[] = [
      {
        id: ProjectId.makeUnsafe("project-1"),
        name: "Nexus",
        cwd: "/tmp/nexus",
        model: "gpt-5-codex",
        expanded: true,
        scripts: [],
      },
    ];
    const threads: Thread[] = [
      {
        id: ThreadId.makeUnsafe("thread-1"),
        codexThreadId: null,
        projectId: ProjectId.makeUnsafe("project-1"),
        title: "Focused thread",
        model: "gpt-5-codex",
        runtimeMode: "full-access",
        interactionMode: "default",
        session: null,
        messages: [],
        proposedPlans: [],
        error: null,
        createdAt: "2026-03-21T00:00:00.000Z",
        updatedAt: "2026-03-21T00:00:00.000Z",
        latestTurn: null,
        branch: null,
        worktreePath: null,
        contextWindow: null,
        turnDiffSummaries: [],
        activities: [],
      },
    ];

    expect(deriveDesktopContextFromRoute("/thread-1", projects, threads)).toEqual({
      projectId: "project-1",
      projectTitle: "Nexus",
      workspaceRoot: "/tmp/nexus",
      threadId: "thread-1",
      threadTitle: "Focused thread",
    });
  });

  it("returns an empty context when there is no active route thread", () => {
    expect(deriveDesktopContextFromRoute("/", [], [])).toEqual({
      projectId: null,
      projectTitle: null,
      workspaceRoot: null,
      threadId: null,
      threadTitle: null,
    });
  });
});
