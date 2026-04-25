import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vitest";

import { deriveDesktopContextFromRoute } from "./desktopContext";
import type { Project, Thread } from "./types";

const ENVIRONMENT_ID = EnvironmentId.make("environment-local");

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: ProjectId.makeUnsafe("project-1"),
    environmentId: ENVIRONMENT_ID,
    name: "Nexus",
    cwd: "/tmp/nexus",
    defaultModelSelection: {
      provider: "codex",
      model: "gpt-5-codex",
    },
    model: "gpt-5-codex",
    expanded: true,
    scripts: [],
    ...overrides,
  };
}

function makeThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: ThreadId.makeUnsafe("thread-1"),
    environmentId: ENVIRONMENT_ID,
    codexThreadId: null,
    projectId: ProjectId.makeUnsafe("project-1"),
    title: "Focused thread",
    modelSelection: {
      provider: "codex",
      model: "gpt-5-codex",
    },
    model: "gpt-5-codex",
    runtimeMode: "full-access",
    interactionMode: "default",
    session: null,
    messages: [],
    proposedPlans: [],
    error: null,
    createdAt: "2026-03-21T00:00:00.000Z",
    archivedAt: null,
    updatedAt: "2026-03-21T00:00:00.000Z",
    latestTurn: null,
    branch: null,
    worktreePath: null,
    contextWindow: null,
    turnDiffSummaries: [],
    activities: [],
    ...overrides,
  };
}

describe("deriveDesktopContextFromRoute", () => {
  it("returns the active project and thread from the current route", () => {
    const projects: Project[] = [makeProject()];
    const threads: Thread[] = [makeThread()];

    expect(deriveDesktopContextFromRoute("/thread-1", projects, threads)).toEqual({
      projectId: "project-1",
      projectTitle: "Nexus",
      workspaceRoot: "/tmp/nexus",
      threadId: "thread-1",
      threadTitle: "Focused thread",
    });
  });

  it("returns an empty context for non-thread routes", () => {
    expect(deriveDesktopContextFromRoute("/", [], [])).toEqual({
      projectId: null,
      projectTitle: null,
      workspaceRoot: null,
      threadId: null,
      threadTitle: null,
    });

    expect(deriveDesktopContextFromRoute("/settings", [makeProject()], [makeThread()])).toEqual({
      projectId: null,
      projectTitle: null,
      workspaceRoot: null,
      threadId: null,
      threadTitle: null,
    });
  });

  it("returns an empty context when the route thread does not exist", () => {
    expect(
      deriveDesktopContextFromRoute("/thread-missing", [makeProject()], [makeThread()]),
    ).toEqual({
      projectId: null,
      projectTitle: null,
      workspaceRoot: null,
      threadId: null,
      threadTitle: null,
    });
  });

  it("returns thread metadata with null project fields when the project is missing", () => {
    expect(deriveDesktopContextFromRoute("/thread-1", [], [makeThread()])).toEqual({
      projectId: null,
      projectTitle: null,
      workspaceRoot: null,
      threadId: "thread-1",
      threadTitle: "Focused thread",
    });
  });
});
