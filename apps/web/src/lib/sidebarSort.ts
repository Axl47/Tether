import type { Project, Thread } from "../types";

type ThreadActivityRecord = Pick<Thread, "id" | "projectId" | "createdAt" | "updatedAt">;

function parseIsoTimestamp(iso: string): number {
  const timestamp = Date.parse(iso);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function getThreadLatestActivityTimestamp(
  thread: Pick<Thread, "createdAt" | "updatedAt">,
): number {
  return Math.max(parseIsoTimestamp(thread.updatedAt), parseIsoTimestamp(thread.createdAt));
}

export function compareThreadsByLatestActivity(
  left: Pick<Thread, "id" | "createdAt" | "updatedAt">,
  right: Pick<Thread, "id" | "createdAt" | "updatedAt">,
): number {
  const byLatestActivity =
    getThreadLatestActivityTimestamp(right) - getThreadLatestActivityTimestamp(left);
  if (byLatestActivity !== 0) {
    return byLatestActivity;
  }

  const byCreatedAt = parseIsoTimestamp(right.createdAt) - parseIsoTimestamp(left.createdAt);
  if (byCreatedAt !== 0) {
    return byCreatedAt;
  }

  return right.id.localeCompare(left.id);
}

export function sortThreadsByLatestActivity<T extends ThreadActivityRecord>(
  threads: readonly T[],
): T[] {
  const nextThreads = Array.from(threads);
  nextThreads.sort(compareThreadsByLatestActivity);
  return nextThreads;
}

export function sortProjectsByLatestThreadUpdate<T extends Pick<Project, "id">>(
  projects: readonly T[],
  threads: readonly ThreadActivityRecord[],
): T[] {
  const latestThreadActivityByProjectId = new Map<Project["id"], number>();
  for (const thread of threads) {
    const activityTimestamp = getThreadLatestActivityTimestamp(thread);
    const previousTimestamp = latestThreadActivityByProjectId.get(thread.projectId) ?? 0;
    if (activityTimestamp > previousTimestamp) {
      latestThreadActivityByProjectId.set(thread.projectId, activityTimestamp);
    }
  }

  const sortedProjects = projects.map((project, index) => ({
    project,
    index,
    latestThreadActivity: latestThreadActivityByProjectId.get(project.id) ?? 0,
  }));
  sortedProjects.sort((left, right) => {
    const byLatestThreadActivity = right.latestThreadActivity - left.latestThreadActivity;
    if (byLatestThreadActivity !== 0) {
      return byLatestThreadActivity;
    }
    return left.index - right.index;
  });

  return sortedProjects.map(({ project }) => project);
}
