import type { ThreadId } from "@t3tools/contracts";

interface TerminalRetentionThread {
  id: ThreadId;
  deletedAt: string | null;
  archivedAt: string | null;
}

interface CollectActiveTerminalThreadIdsInput {
  snapshotThreads: readonly TerminalRetentionThread[];
  draftThreadIds: Iterable<ThreadId>;
}

export function collectActiveTerminalThreadIds(
  input: CollectActiveTerminalThreadIdsInput,
): Set<ThreadId> {
  const activeThreadIds = new Set<ThreadId>();
  for (const thread of input.snapshotThreads) {
    if (thread.deletedAt !== null || thread.archivedAt !== null) continue;
    activeThreadIds.add(thread.id);
  }
  for (const draftThreadId of input.draftThreadIds) {
    activeThreadIds.add(draftThreadId);
  }
  return activeThreadIds;
}
