import type { ServerSetDesktopContextInput } from "@t3tools/contracts";

import type { Project, Thread } from "./types";

export function deriveDesktopContextFromRoute(
  pathname: string,
  projects: Project[],
  threads: Thread[],
): ServerSetDesktopContextInput {
  const routeThreadId = routeThreadIdFromPathname(pathname);
  if (!routeThreadId) {
    return emptyDesktopContext();
  }

  const activeThread = threads.find((thread) => thread.id === routeThreadId) ?? null;
  if (!activeThread) {
    return emptyDesktopContext();
  }

  const activeProject = projects.find((project) => project.id === activeThread.projectId) ?? null;
  return {
    projectId: activeProject?.id ?? null,
    projectTitle: activeProject?.name ?? null,
    workspaceRoot: activeProject?.cwd ?? null,
    threadId: activeThread.id,
    threadTitle: activeThread.title,
  };
}

function routeThreadIdFromPathname(pathname: string): string | null {
  const segments = pathname
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => decodeURIComponent(segment));

  if (
    segments.length === 0 ||
    segments[0] === "settings" ||
    segments[0] === "pair" ||
    segments[0] === "draft"
  ) {
    return null;
  }

  if (segments.length >= 2) {
    return segments[1] ?? null;
  }

  // Backward-compatible with the pre-environment route shape used by older tests/dev builds.
  return segments[0] ?? null;
}

function emptyDesktopContext(): ServerSetDesktopContextInput {
  return {
    projectId: null,
    projectTitle: null,
    workspaceRoot: null,
    threadId: null,
    threadTitle: null,
  };
}
