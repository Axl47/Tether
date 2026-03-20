import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  CheckpointRef,
  ThreadId,
  type ProviderSession,
  type ProviderTurnStartResult,
} from "@t3tools/contracts";
import { assert, it } from "@effect/vitest";
import { Effect, Layer, ManagedRuntime, Stream } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import {
  CheckpointStore,
  type CheckpointStoreShape,
} from "../../checkpointing/Services/CheckpointStore.ts";
import { ServerConfig } from "../../config.ts";
import { makeSqlitePersistenceLive } from "../../persistence/Layers/Sqlite.ts";
import { OrchestrationProjectionSnapshotQueryLive } from "./ProjectionSnapshotQuery.ts";
import { ThreadForceDeleteLive } from "./ThreadForceDelete.ts";
import { ThreadForceDelete } from "../Services/ThreadForceDelete.ts";
import {
  ProviderService,
  type ProviderServiceShape,
} from "../../provider/Services/ProviderService.ts";

const makeProviderServiceStub = (stoppedThreadIds: Array<ThreadId>): ProviderServiceShape => ({
  startSession: () => Effect.die("not implemented"),
  sendTurn: (): Effect.Effect<ProviderTurnStartResult> => Effect.die("not implemented"),
  interruptTurn: () => Effect.void,
  respondToRequest: () => Effect.void,
  respondToUserInput: () => Effect.void,
  stopSession: ({ threadId }) =>
    Effect.sync(() => {
      stoppedThreadIds.push(threadId);
    }),
  listSessions: (): Effect.Effect<ReadonlyArray<ProviderSession>> => Effect.succeed([]),
  getCapabilities: () => Effect.die("not implemented"),
  rollbackConversation: () => Effect.void,
  streamEvents: Stream.empty,
});

const makeCheckpointStoreStub = (
  deletedRefs: Array<{ cwd: string; checkpointRefs: ReadonlyArray<CheckpointRef> }>,
): CheckpointStoreShape => ({
  isGitRepository: () => Effect.succeed(true),
  captureCheckpoint: () => Effect.void,
  hasCheckpointRef: () => Effect.succeed(false),
  restoreCheckpoint: () => Effect.succeed(false),
  diffCheckpoints: () => Effect.succeed(""),
  deleteCheckpointRefs: (input) =>
    Effect.sync(() => {
      deletedRefs.push(input);
    }),
});

const makeThreadForceDeleteTestLayer = (input: {
  stateDir: string;
  providerService: ProviderServiceShape;
  checkpointStore: CheckpointStoreShape;
}) =>
  ThreadForceDeleteLive.pipe(
    Layer.provideMerge(OrchestrationProjectionSnapshotQueryLive),
    Layer.provideMerge(Layer.succeed(ProviderService, input.providerService)),
    Layer.provideMerge(Layer.succeed(CheckpointStore, input.checkpointStore)),
    Layer.provideMerge(ServerConfig.layerTest(process.cwd(), input.stateDir)),
    Layer.provideMerge(makeSqlitePersistenceLive(path.join(input.stateDir, "state.sqlite"))),
    Layer.provideMerge(NodeServices.layer),
  );

const runWithThreadForceDeleteLayer = <A, E>(
  stateDir: string,
  providerService: ProviderServiceShape,
  checkpointStore: CheckpointStoreShape,
  effect: Effect.Effect<A, E, ThreadForceDelete | SqlClient.SqlClient>,
) =>
  Effect.acquireUseRelease(
    Effect.sync(() =>
      ManagedRuntime.make(
        makeThreadForceDeleteTestLayer({
          stateDir,
          providerService,
          checkpointStore,
        }),
      ),
    ),
    (runtime) => Effect.promise(() => runtime.runPromise(effect)),
    (runtime) => Effect.promise(() => runtime.dispose()),
  );

it.effect("hard-deletes a thread and its persisted artifacts", () =>
  Effect.gen(function* () {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "t3-thread-force-delete-"));
    const stoppedThreadIds: Array<ThreadId> = [];
    const deletedCheckpointRefs: Array<{
      cwd: string;
      checkpointRefs: ReadonlyArray<CheckpointRef>;
    }> = [];
    const providerService = makeProviderServiceStub(stoppedThreadIds);
    const checkpointStore = makeCheckpointStoreStub(deletedCheckpointRefs);
    const threadId = ThreadId.makeUnsafe("thread-force-delete");
    const projectId = "project-force-delete";
    const checkpointRef = CheckpointRef.makeUnsafe("refs/t3/checkpoints/thread-force-delete/1");
    const attachmentId = "thread-force-delete-12345678-1234-1234-1234-123456789abc";
    const attachmentPath = path.join(stateDir, "attachments", `${attachmentId}.png`);
    const now = "2026-03-10T12:00:00.000Z";

    fs.mkdirSync(path.dirname(attachmentPath), { recursive: true });
    fs.writeFileSync(attachmentPath, "image-bytes", "utf8");

    yield* runWithThreadForceDeleteLayer(
      stateDir,
      providerService,
      checkpointStore,
      Effect.gen(function* () {
        const threadForceDelete = yield* ThreadForceDelete;
        const sql = yield* SqlClient.SqlClient;

        yield* sql`
          INSERT INTO projection_projects (
            project_id,
            title,
            workspace_root,
            default_model,
            scripts_json,
            created_at,
            updated_at,
            deleted_at
          )
          VALUES (
            ${projectId},
            ${"Force Delete Project"},
            ${stateDir},
            NULL,
            ${"[]"},
            ${now},
            ${now},
            NULL
          )
        `;
        yield* sql`
          INSERT INTO projection_threads (
            thread_id,
            project_id,
            title,
            model,
            runtime_mode,
            interaction_mode,
            branch,
            worktree_path,
            context_window_json,
            latest_turn_id,
            last_autorename_user_message_id,
            created_at,
            updated_at,
            deleted_at
          )
          VALUES (
            ${threadId},
            ${projectId},
            ${"Delete Me"},
            ${"gpt-5-codex"},
            ${"full-access"},
            ${"default"},
            NULL,
            NULL,
            NULL,
            ${"turn-1"},
            NULL,
            ${now},
            ${now},
            NULL
          )
        `;
        yield* sql`
          INSERT INTO projection_thread_messages (
            message_id,
            thread_id,
            turn_id,
            role,
            text,
            attachments_json,
            is_streaming,
            created_at,
            updated_at
          )
          VALUES (
            ${"message-1"},
            ${threadId},
            NULL,
            ${"user"},
            ${"hello"},
            ${JSON.stringify([
              {
                type: "image",
                id: attachmentId,
                name: "image.png",
                mimeType: "image/png",
                sizeBytes: 10,
              },
            ])},
            0,
            ${now},
            ${now}
          )
        `;
        yield* sql`
          INSERT INTO projection_thread_activities (
            activity_id,
            thread_id,
            turn_id,
            tone,
            kind,
            summary,
            payload_json,
            sequence,
            created_at
          )
          VALUES (
            ${"activity-1"},
            ${threadId},
            NULL,
            ${"info"},
            ${"thread.message"},
            ${"hello"},
            ${"{}"},
            1,
            ${now}
          )
        `;
        yield* sql`
          INSERT INTO projection_thread_proposed_plans (
            plan_id,
            thread_id,
            turn_id,
            plan_markdown,
            created_at,
            updated_at
          )
          VALUES (
            ${"plan-1"},
            ${threadId},
            NULL,
            ${"# Plan"},
            ${now},
            ${now}
          )
        `;
        yield* sql`
          INSERT INTO projection_thread_sessions (
            thread_id,
            status,
            provider_name,
            runtime_mode,
            active_turn_id,
            last_error,
            updated_at
          )
          VALUES (
            ${threadId},
            ${"running"},
            ${"codex"},
            ${"full-access"},
            ${"turn-1"},
            NULL,
            ${now}
          )
        `;
        yield* sql`
          INSERT INTO projection_turns (
            thread_id,
            turn_id,
            pending_message_id,
            assistant_message_id,
            state,
            requested_at,
            started_at,
            completed_at,
            checkpoint_turn_count,
            checkpoint_ref,
            checkpoint_status,
            checkpoint_files_json
          )
          VALUES (
            ${threadId},
            ${"turn-1"},
            NULL,
            NULL,
            ${"completed"},
            ${now},
            ${now},
            ${now},
            1,
            ${checkpointRef},
            ${"ready"},
            ${"[]"}
          )
        `;
        yield* sql`
          INSERT INTO projection_pending_approvals (
            request_id,
            thread_id,
            turn_id,
            status,
            decision,
            created_at,
            resolved_at
          )
          VALUES (
            ${"request-1"},
            ${threadId},
            NULL,
            ${"pending"},
            NULL,
            ${now},
            NULL
          )
        `;
        yield* sql`
          INSERT INTO provider_session_runtime (
            thread_id,
            provider_name,
            adapter_key,
            runtime_mode,
            status,
            last_seen_at,
            resume_cursor_json,
            runtime_payload_json
          )
          VALUES (
            ${threadId},
            ${"codex"},
            ${"codex"},
            ${"full-access"},
            ${"running"},
            ${now},
            ${"{}"},
            ${"{}"}
          )
        `;
        yield* sql`
          INSERT INTO orchestration_events (
            event_id,
            aggregate_kind,
            stream_id,
            stream_version,
            event_type,
            occurred_at,
            command_id,
            causation_event_id,
            correlation_id,
            actor_kind,
            payload_json,
            metadata_json
          )
          VALUES (
            ${"event-1"},
            ${"thread"},
            ${threadId},
            0,
            ${"thread.created"},
            ${now},
            ${"command-1"},
            NULL,
            ${"command-1"},
            ${"client"},
            ${JSON.stringify({
              threadId,
              projectId,
              title: "Delete Me",
              model: "gpt-5-codex",
              runtimeMode: "full-access",
              interactionMode: "default",
              branch: null,
              worktreePath: null,
              createdAt: now,
              updatedAt: now,
            })},
            ${"{}"}
          )
        `;
        yield* sql`
          INSERT INTO orchestration_command_receipts (
            command_id,
            aggregate_kind,
            aggregate_id,
            accepted_at,
            result_sequence,
            status,
            error
          )
          VALUES (
            ${"command-1"},
            ${"thread"},
            ${threadId},
            ${now},
            1,
            ${"accepted"},
            NULL
          )
        `;

        const snapshot = yield* threadForceDelete.forceDeleteThread({ threadId });

        assert.equal(
          snapshot.threads.some((thread) => thread.id === threadId),
          false,
        );
        assert.deepEqual(stoppedThreadIds, [threadId]);
        assert.deepEqual(deletedCheckpointRefs, [
          {
            cwd: stateDir,
            checkpointRefs: [checkpointRef],
          },
        ]);
        assert.equal(fs.existsSync(attachmentPath), false);

        const projectionThreadCount = (yield* sql`
          SELECT COUNT(*) AS "count"
          FROM projection_threads
          WHERE thread_id = ${threadId}
        `) as Array<{ count: number }>;
        const messageCount = (yield* sql`
          SELECT COUNT(*) AS "count"
          FROM projection_thread_messages
          WHERE thread_id = ${threadId}
        `) as Array<{ count: number }>;
        const activityCount = (yield* sql`
          SELECT COUNT(*) AS "count"
          FROM projection_thread_activities
          WHERE thread_id = ${threadId}
        `) as Array<{ count: number }>;
        const proposedPlanCount = (yield* sql`
          SELECT COUNT(*) AS "count"
          FROM projection_thread_proposed_plans
          WHERE thread_id = ${threadId}
        `) as Array<{ count: number }>;
        const sessionCount = (yield* sql`
          SELECT COUNT(*) AS "count"
          FROM projection_thread_sessions
          WHERE thread_id = ${threadId}
        `) as Array<{ count: number }>;
        const turnCount = (yield* sql`
          SELECT COUNT(*) AS "count"
          FROM projection_turns
          WHERE thread_id = ${threadId}
        `) as Array<{ count: number }>;
        const pendingApprovalCount = (yield* sql`
          SELECT COUNT(*) AS "count"
          FROM projection_pending_approvals
          WHERE thread_id = ${threadId}
        `) as Array<{ count: number }>;
        const runtimeCount = (yield* sql`
          SELECT COUNT(*) AS "count"
          FROM provider_session_runtime
          WHERE thread_id = ${threadId}
        `) as Array<{ count: number }>;
        const eventCount = (yield* sql`
          SELECT COUNT(*) AS "count"
          FROM orchestration_events
          WHERE aggregate_kind = 'thread'
            AND stream_id = ${threadId}
        `) as Array<{ count: number }>;
        const receiptCount = (yield* sql`
          SELECT COUNT(*) AS "count"
          FROM orchestration_command_receipts
          WHERE aggregate_kind = 'thread'
            AND aggregate_id = ${threadId}
        `) as Array<{ count: number }>;

        assert.equal(projectionThreadCount[0]?.count, 0);
        assert.equal(messageCount[0]?.count, 0);
        assert.equal(activityCount[0]?.count, 0);
        assert.equal(proposedPlanCount[0]?.count, 0);
        assert.equal(sessionCount[0]?.count, 0);
        assert.equal(turnCount[0]?.count, 0);
        assert.equal(pendingApprovalCount[0]?.count, 0);
        assert.equal(runtimeCount[0]?.count, 0);
        assert.equal(eventCount[0]?.count, 0);
        assert.equal(receiptCount[0]?.count, 0);
      }),
    ).pipe(
      Effect.ensuring(Effect.sync(() => fs.rmSync(stateDir, { recursive: true, force: true }))),
    );
  }),
);
