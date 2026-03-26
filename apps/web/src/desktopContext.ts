import type { ServerSetDesktopContextInput } from "@t3tools/contracts";

import type { Project, Thread } from "./types";

export function deriveDesktopContextFromRoute(
  pathname: string,
  projects: Project[],
  threads: Thread[],
): ServerSetDesktopContextInput {
  if (pathname === "/" || pathname === "/settings") {
    return emptyDesktopContext();
  }

  const routeThreadId = pathname.startsWith("/") ? pathname.slice(1) : pathname;
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

function emptyDesktopContext(): ServerSetDesktopContextInput {
  return {
    projectId: null,
    projectTitle: null,
    workspaceRoot: null,
    threadId: null,
    threadTitle: null,
  };
}
