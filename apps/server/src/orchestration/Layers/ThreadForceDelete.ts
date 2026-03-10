import { ThreadId, type OrchestrationForceDeleteThreadInput } from "@t3tools/contracts";
import { CheckpointStore } from "../../checkpointing/Services/CheckpointStore.ts";
import { resolveThreadWorkspaceCwd } from "../../checkpointing/Utils.ts";
import {
  parseAttachmentIdFromRelativePath,
  parseThreadSegmentFromAttachmentId,
  toSafeThreadAttachmentSegment,
} from "../../attachmentStore.ts";
import { ServerConfig } from "../../config.ts";
import { ProjectionSnapshotQuery } from "../Services/ProjectionSnapshotQuery.ts";
import {
  ThreadForceDelete,
  ThreadForceDeleteError,
  type ThreadForceDeleteShape,
} from "../Services/ThreadForceDelete.ts";
import { ProviderService } from "../../provider/Services/ProviderService.ts";
import { Effect, FileSystem, Layer, Path } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

function errorMessage(cause: unknown): string {
  if (cause instanceof Error && cause.message.trim().length > 0) {
    return cause.message;
  }
  return String(cause);
}

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const checkpointStore = yield* CheckpointStore;
  const projectionSnapshotQuery = yield* ProjectionSnapshotQuery;
  const providerService = yield* ProviderService;
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const serverConfig = yield* ServerConfig;

  const deleteThreadAttachments = (threadId: ThreadId) =>
    Effect.gen(function* () {
      const threadSegment = toSafeThreadAttachmentSegment(threadId);
      if (!threadSegment) {
        return;
      }
      const attachmentsRootDir = path.join(serverConfig.stateDir, "attachments");
      const entries = yield* fileSystem
        .readDirectory(attachmentsRootDir, { recursive: false })
        .pipe(Effect.catch(() => Effect.succeed([] as Array<string>)));
      for (const entry of entries) {
        const normalizedEntry = entry.replace(/^[/\\]+/, "").replace(/\\/g, "/");
        if (normalizedEntry.length === 0 || normalizedEntry.includes("/")) {
          continue;
        }
        const attachmentId = parseAttachmentIdFromRelativePath(normalizedEntry);
        if (!attachmentId) {
          continue;
        }
        const attachmentThreadSegment = parseThreadSegmentFromAttachmentId(attachmentId);
        if (!attachmentThreadSegment) {
          continue;
        }
        if (attachmentThreadSegment !== threadSegment) {
          continue;
        }
        yield* fileSystem.remove(path.join(attachmentsRootDir, normalizedEntry), {
          force: true,
        });
      }
    });

  const forceDeleteThread: ThreadForceDeleteShape["forceDeleteThread"] = (rawInput) =>
    Effect.gen(function* () {
      const input = rawInput as OrchestrationForceDeleteThreadInput;
      const snapshot = yield* projectionSnapshotQuery.getSnapshot().pipe(
        Effect.mapError(
          (cause) =>
            new ThreadForceDeleteError({
              message: `Failed to load thread snapshot: ${errorMessage(cause)}`,
            }),
        ),
      );
      const thread = snapshot.threads.find(
        (entry) => entry.id === input.threadId && entry.deletedAt === null,
      );
      if (!thread) {
        return yield* new ThreadForceDeleteError({
          message: `Thread not found: ${input.threadId}`,
        });
      }

      const threadCwd = resolveThreadWorkspaceCwd({
        thread,
        projects: snapshot.projects,
      });
      const checkpointRefs = [...new Set(thread.checkpoints.map((checkpoint) => checkpoint.checkpointRef))];

      yield* providerService
        .stopSession({ threadId: input.threadId })
        .pipe(Effect.catch(() => Effect.void));

      if (threadCwd && checkpointRefs.length > 0) {
        yield* checkpointStore
          .deleteCheckpointRefs({
            cwd: threadCwd,
            checkpointRefs,
          })
          .pipe(Effect.catch(() => Effect.void));
      }

      yield* deleteThreadAttachments(input.threadId).pipe(Effect.catch(() => Effect.void));

      yield* sql
        .withTransaction(
          Effect.gen(function* () {
            yield* sql`
              DELETE FROM projection_pending_approvals
              WHERE thread_id = ${input.threadId}
            `;
            yield* sql`
              DELETE FROM projection_thread_proposed_plans
              WHERE thread_id = ${input.threadId}
            `;
            yield* sql`
              DELETE FROM projection_thread_activities
              WHERE thread_id = ${input.threadId}
            `;
            yield* sql`
              DELETE FROM projection_thread_messages
              WHERE thread_id = ${input.threadId}
            `;
            yield* sql`
              DELETE FROM projection_thread_sessions
              WHERE thread_id = ${input.threadId}
            `;
            yield* sql`
              DELETE FROM projection_turns
              WHERE thread_id = ${input.threadId}
            `;
            yield* sql`
              DELETE FROM projection_threads
              WHERE thread_id = ${input.threadId}
            `;
            yield* sql`
              DELETE FROM provider_session_runtime
              WHERE thread_id = ${input.threadId}
            `;
            yield* sql`
              DELETE FROM orchestration_command_receipts
              WHERE aggregate_kind = 'thread'
                AND aggregate_id = ${input.threadId}
            `;
            yield* sql`
              DELETE FROM orchestration_events
              WHERE aggregate_kind = 'thread'
                AND stream_id = ${input.threadId}
            `;
          }),
        )
        .pipe(
          Effect.mapError(
            (cause) =>
              new ThreadForceDeleteError({
                message: `Failed to delete thread data: ${errorMessage(cause)}`,
              }),
          ),
        );

      return yield* projectionSnapshotQuery.getSnapshot().pipe(
        Effect.mapError(
          (cause) =>
            new ThreadForceDeleteError({
              message: `Failed to reload thread snapshot: ${errorMessage(cause)}`,
            }),
        ),
      );
    });

  return {
    forceDeleteThread,
  } satisfies ThreadForceDeleteShape;
});

export const ThreadForceDeleteLive = Layer.effect(ThreadForceDelete, make);
