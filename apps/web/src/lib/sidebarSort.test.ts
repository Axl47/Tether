import { ProjectId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vitest";

import { sortProjectsByLatestThreadUpdate, sortThreadsByLatestActivity } from "./sidebarSort";

describe("sidebarSort", () => {
  it("sorts projects by their latest thread update", () => {
    const projects = [
      { id: ProjectId.makeUnsafe("project-1") },
      { id: ProjectId.makeUnsafe("project-2") },
      { id: ProjectId.makeUnsafe("project-3") },
    ];
    const threads = [
      {
        id: ThreadId.makeUnsafe("thread-1"),
        projectId: ProjectId.makeUnsafe("project-1"),
        createdAt: "2026-03-01T10:00:00.000Z",
        updatedAt: "2026-03-01T10:05:00.000Z",
      },
      {
        id: ThreadId.makeUnsafe("thread-2"),
        projectId: ProjectId.makeUnsafe("project-2"),
        createdAt: "2026-03-01T09:00:00.000Z",
        updatedAt: "2026-03-01T12:00:00.000Z",
      },
    ];

    const sorted = sortProjectsByLatestThreadUpdate(projects, threads);

    expect(sorted.map((project) => project.id)).toEqual([
      ProjectId.makeUnsafe("project-2"),
      ProjectId.makeUnsafe("project-1"),
      ProjectId.makeUnsafe("project-3"),
    ]);
  });

  it("preserves original project order when latest thread updates tie", () => {
    const projects = [
      { id: ProjectId.makeUnsafe("project-1") },
      { id: ProjectId.makeUnsafe("project-2") },
    ];
    const threads = [
      {
        id: ThreadId.makeUnsafe("thread-1"),
        projectId: ProjectId.makeUnsafe("project-1"),
        createdAt: "2026-03-01T10:00:00.000Z",
        updatedAt: "2026-03-01T11:00:00.000Z",
      },
      {
        id: ThreadId.makeUnsafe("thread-2"),
        projectId: ProjectId.makeUnsafe("project-2"),
        createdAt: "2026-03-01T10:30:00.000Z",
        updatedAt: "2026-03-01T11:00:00.000Z",
      },
    ];

    const sorted = sortProjectsByLatestThreadUpdate(projects, threads);

    expect(sorted.map((project) => project.id)).toEqual([
      ProjectId.makeUnsafe("project-1"),
      ProjectId.makeUnsafe("project-2"),
    ]);
  });

  it("sorts threads by latest activity instead of creation time", () => {
    const threads = [
      {
        id: ThreadId.makeUnsafe("thread-1"),
        projectId: ProjectId.makeUnsafe("project-1"),
        createdAt: "2026-03-01T08:00:00.000Z",
        updatedAt: "2026-03-01T08:10:00.000Z",
      },
      {
        id: ThreadId.makeUnsafe("thread-2"),
        projectId: ProjectId.makeUnsafe("project-1"),
        createdAt: "2026-03-01T09:00:00.000Z",
        updatedAt: "2026-03-01T09:05:00.000Z",
      },
      {
        id: ThreadId.makeUnsafe("thread-3"),
        projectId: ProjectId.makeUnsafe("project-1"),
        createdAt: "2026-03-01T07:00:00.000Z",
        updatedAt: "2026-03-01T10:00:00.000Z",
      },
    ];

    const sorted = sortThreadsByLatestActivity(threads);

    expect(sorted.map((thread) => thread.id)).toEqual([
      ThreadId.makeUnsafe("thread-3"),
      ThreadId.makeUnsafe("thread-2"),
      ThreadId.makeUnsafe("thread-1"),
    ]);
  });
});
