# Queued Follow-Up Messages For Running Threads

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository includes `.docs/PLANS.md`. This document must be maintained in accordance with `.docs/PLANS.md`.

## Purpose / Big Picture

After this change, a user can submit follow-up prompts while a thread is still running. Instead of losing the message or forcing the user to wait, the web app stores a per-thread first-in-first-out queue of follow-up message snapshots, shows those queued items above the composer, and automatically dispatches the next queued item when the thread becomes idle and no blocking approval or structured user-input workflow is active.

The user-visible proof is straightforward. Start a thread, let it keep running, type another message, and press Enter. The composer should clear, a queued card should appear with `Steer`, trash, and pencil controls, and the queued message should send automatically once the current run fully settles. If the user clicks `Steer`, the app should interrupt the current run and send that queued item next when interruption is complete.

## Progress

- [x] (2026-03-08 23:50Z) Read `.docs/PLANS.md`, the `task-orchestrator` skill, and the current web store/send-path files to confirm the implementation boundaries.
- [x] (2026-03-09 20:20Z) Add persisted queued message state and queue actions to `apps/web/src/composerDraftStore.ts`, plus store coverage in `apps/web/src/composerDraftStore.test.ts`.
- [x] (2026-03-09 20:20Z) Extract queued-turn send helpers into `apps/web/src/queuedTurns.ts` with focused tests in `apps/web/src/queuedTurns.test.ts`.
- [x] (2026-03-09 20:20Z) Add a root-mounted queued turn dispatcher in `apps/web/src/components/QueuedTurnDispatcher.tsx` and mount it from `apps/web/src/routes/__root.tsx`.
- [x] (2026-03-09 20:20Z) Update `apps/web/src/components/ChatView.tsx` to queue follow-ups while running, render queued cards, support `Steer`/trash/pencil actions, and preserve existing approval/user-input priorities.
- [x] (2026-03-09 20:20Z) Add browser coverage in `apps/web/src/components/ChatView.browser.tsx` for queueing, blocking rules, auto-dispatch, and queue actions.
- [x] (2026-03-09 20:20Z) Run `PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun -b lint`, `PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun typecheck`, `PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun run test src/composerDraftStore.test.ts src/queuedTurns.test.ts`, and `PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun run test:browser src/components/ChatView.browser.tsx`.

## Surprises & Discoveries

- Observation: `bun lint` in this environment does not run cleanly through the default wrapper, but `PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun -b lint` succeeds.
  Evidence: earlier local validation succeeded with the explicit Bun binary and `-b` flag.

## Decision Log

- Decision: Keep queued follow-up behavior web-only and reuse the existing persisted composer draft storage instead of adding server contracts.
  Rationale: the requested feature is local orchestration state, and the current `composerDraftStore.ts` already persists prompt text, attachment snapshots, and thread-scoped metadata that match queued message needs.
  Date/Author: 2026-03-08 / Codex

- Decision: Add a root-mounted dispatcher component rather than keeping queued auto-send logic inside `ChatView.tsx`.
  Rationale: queued messages must flush even when their thread is not the visible route, and the root route already hosts read-model synchronization side effects such as `EventRouter`.
  Date/Author: 2026-03-08 / Codex

## Outcomes & Retrospective

The queued follow-up system landed end to end. Running threads now accept submitted follow-ups into a persisted per-thread queue, queued cards render above the composer with `Steer`, delete, and edit actions, the root dispatcher flushes queued items when threads become eligible, and queued items stay blocked behind pending approvals or structured user-input requests. The work also added store, helper, and browser coverage plus the Bun PATH workaround in `AGENTS.md` for reproducible validation commands in this environment.

## Context and Orientation

The feature lives entirely in `apps/web`. The file `apps/web/src/composerDraftStore.ts` is a Zustand store persisted to local storage under `COMPOSER_DRAFT_STORAGE_KEY`. It already stores one live composer draft per thread, plus metadata for draft-only threads and persisted image attachments. That makes it the right home for queued message snapshots because those queued entries need the same fields as a live composer draft: prompt text, persisted image data, provider and model selection, runtime mode, interaction mode, reasoning effort, and Codex fast mode.

The file `apps/web/src/components/ChatView.tsx` is the main thread screen. It owns the composer, send handling, approval and structured user-input flows, optimistic local user messages, and the existing helper `persistThreadSettingsForNextTurn`. The current `onSend` function dispatches turns immediately and has special handling for plan follow-ups, first-message thread creation, and worktree setup. The current `onSubmitPlanFollowUp` function also dispatches a same-thread message directly. The queued follow-up implementation must not disturb first-message thread creation or approval/user-input flows. It only applies when the active thread is an existing server-backed thread and `derivePhase(session) === "running"`.

The file `apps/web/src/session-logic.ts` already exposes `derivePhase`, `derivePendingApprovals`, and `derivePendingUserInputs`. These functions determine whether a queued follow-up is allowed to auto-dispatch. A "blocking approval" means an unresolved approval request in the thread activity log. A "structured user-input request" means a pending multi-question request shown through the existing question UI.

The file `apps/web/src/routes/__root.tsx` mounts global side-effect components. `EventRouter` already keeps the local read model synchronized with server events. The new queued dispatcher belongs beside it so queued messages can flush for background threads without depending on route-specific component lifecycles.

The tests that matter already exist. `apps/web/src/composerDraftStore.test.ts` exercises the persisted store and image handling. `apps/web/src/components/ChatView.browser.tsx` exercises real browser behavior, including the routed app shell and websocket stubs.

## Plan of Work

First, extend `apps/web/src/composerDraftStore.ts` with queue-specific types and state. Add a persisted queue map keyed by `ThreadId`, normalize and hydrate queued entries the same way the store already hydrates persisted composer attachments, and expose queue mutation methods. `enqueueQueuedMessage` should insert at the end by default or at a requested index. `promoteQueuedMessage` should move an item to the front without altering the stored payload. `consumeQueuedMessage` should remove the queued item only after dispatch succeeds. `loadQueuedMessageIntoComposer` should move the queued item into the live composer draft, and when requested it should swap the current sendable composer content back into the same queue position.

Second, create `apps/web/src/queuedTurns.ts` to hold shared queued-turn logic. This module should define a queue snapshot shape based on the composer draft fields, a `queuedMessagePreview` helper for rendering compact card text, a `canAutoDispatchQueuedTurn` guard that combines thread/session/blocking state, and a `dispatchQueuedTurn` helper that reuses the existing same-thread send semantics without creating new threads, worktrees, or optimistic messages.

Third, add `apps/web/src/components/QueuedTurnDispatcher.tsx` and mount it from `apps/web/src/routes/__root.tsx`. The dispatcher should watch the read-model threads and the queued message store, track which thread ids are currently dispatching to avoid duplicates, and send the queue head when a thread becomes eligible. On success it should call `consumeQueuedMessage`. On failure it should keep the queued item in place and surface the error through the existing thread error store when possible.

Fourth, update `apps/web/src/components/ChatView.tsx`. When the active thread is running, already server-backed, and not in approval or structured user-input mode, pressing Enter should enqueue a message snapshot instead of dispatching immediately. The composer should clear only its content, keep settings, and continue focusing the editor. The placeholder during a running thread should change to `Ask for follow-up changes`. Render queued cards above the composer shell. Each card should show a preview and three actions: `Steer`, trash, and pencil. `Steer` should promote the selected item and interrupt the current turn if still running. Trash should remove the item. Pencil should move the queued payload into the composer and optionally swap the current sendable draft back into the queue.

Finally, update tests. Store tests must cover queue ordering, persistence, cleanup, consume, and edit/swap behavior. Browser tests must cover queueing during `running`, root auto-dispatch after settling, approval and user-input blocking, and the `Steer`/trash/pencil actions.

## Concrete Steps

Run all commands from the repository root, `/Users/axel/Desktop/Code_Projects/Personal/Tether`.

Read the current files before editing:

    sed -n '1,320p' apps/web/src/composerDraftStore.ts
    sed -n '1880,3360p' apps/web/src/components/ChatView.tsx
    sed -n '1,260p' apps/web/src/routes/__root.tsx
    sed -n '1,260p' apps/web/src/session-logic.ts

After implementing the store and queue helpers, run focused tests:

    PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun run test apps/web/src/composerDraftStore.test.ts

After implementing the browser flow, run browser coverage for the affected file:

    PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun run test apps/web/src/components/ChatView.browser.tsx

Run required repository validation:

    PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun -b lint
    PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun typecheck

Expected successful output includes passing Vitest suites and no lint or type errors.

## Validation and Acceptance

Acceptance is behavioral, not just structural. A human should be able to start the app, open an existing thread, let the assistant keep running, type a follow-up message, and press Enter. The composer content should clear, a queued card should appear above the composer, and the thread should continue running until it naturally settles or the user clicks `Steer`. Once the thread becomes idle and there is no pending approval or structured user-input request, the head queued card should disappear and the queued message should be sent.

The `Steer` button is accepted when clicking it during a running thread sends `thread.turn.interrupt`, keeps the queued item intact during interruption, and then dispatches that queued item next. The pencil action is accepted when it restores the queued message into the composer and, if the composer already had sendable content, places that replaced content back into the queue at the same index. The trash action is accepted when it deletes only the targeted queued item.

Automated acceptance requires passing `apps/web/src/composerDraftStore.test.ts`, the affected `ChatView.browser.tsx` scenarios, `PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun -b lint`, and `PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun typecheck`.

## Idempotence and Recovery

The store and UI edits are additive and safe to rerun. If a queued dispatch fails, the queued item must remain in the queue. If a test fails mid-implementation, the safe recovery path is to fix the failing file and rerun the same targeted Vitest command. No migration or destructive data rewrite is required beyond expanding the existing persisted composer draft schema; missing queue data should normalize to an empty queue map.

## Artifacts and Notes

The most important existing implementation hooks are:

    apps/web/src/composerDraftStore.ts
      Existing persisted attachment hydration for composer images.

    apps/web/src/components/ChatView.tsx
      `persistThreadSettingsForNextTurn`
      `onSend`
      `onSubmitPlanFollowUp`
      `onInterrupt`

    apps/web/src/session-logic.ts
      `derivePhase`
      `derivePendingApprovals`
      `derivePendingUserInputs`

    apps/web/src/routes/__root.tsx
      `EventRouter`

## Interfaces and Dependencies

In `apps/web/src/composerDraftStore.ts`, define two queue-specific interfaces:

    export interface PersistedQueuedComposerMessageState {
      id: string;
      createdAt: string;
      prompt: string;
      attachments: PersistedComposerImageAttachment[];
      provider?: ProviderKind | null;
      model?: string | null;
      runtimeMode?: RuntimeMode | null;
      interactionMode?: ProviderInteractionMode | null;
      effort?: CodexReasoningEffort | null;
      codexFastMode?: boolean | null;
    }

    export interface QueuedComposerMessageState {
      id: string;
      createdAt: string;
      prompt: string;
      images: ComposerImageAttachment[];
      nonPersistedImageIds: string[];
      persistedAttachments: PersistedComposerImageAttachment[];
      provider: ProviderKind | null;
      model: string | null;
      runtimeMode: RuntimeMode | null;
      interactionMode: ProviderInteractionMode | null;
      effort: CodexReasoningEffort | null;
      codexFastMode: boolean;
    }

The store state must include:

    queuedMessagesByThreadId: Record<ThreadId, QueuedComposerMessageState[]>

The store API must include:

    enqueueQueuedMessage(
      threadId: ThreadId,
      snapshot: Omit<QueuedComposerMessageState, "images" | "nonPersistedImageIds" | "persistedAttachments"> & {
        images: ComposerImageAttachment[];
        persistedAttachments?: PersistedComposerImageAttachment[];
        nonPersistedImageIds?: string[];
      },
      options?: { index?: number },
    ): void

    removeQueuedMessage(threadId: ThreadId, queuedMessageId: string): void
    promoteQueuedMessage(threadId: ThreadId, queuedMessageId: string): void
    consumeQueuedMessage(threadId: ThreadId, queuedMessageId: string): void
    loadQueuedMessageIntoComposer(
      threadId: ThreadId,
      queuedMessageId: string,
      options: { swapComposerContent: boolean },
    ): void

In `apps/web/src/queuedTurns.ts`, define helpers that operate only on existing server threads:

    export function queuedMessagePreview(snapshot: {
      prompt: string;
      persistedAttachments: ReadonlyArray<{ name: string }>;
    }): string

    export function canAutoDispatchQueuedTurn(input: {
      thread: Thread | null;
      isConnecting: boolean;
      isRevertingCheckpoint: boolean;
      isLocalSendInFlight: boolean;
    }): boolean

    export async function dispatchQueuedTurn(input: {
      api: NativeApi;
      thread: Thread;
      snapshot: QueuedComposerMessageState;
      settings: {
        enableAssistantStreaming: boolean;
      };
      setThreadError: (threadId: ThreadId, error: string | null) => void;
    }): Promise<void>

Revision note: Updated on 2026-03-09 after implementation completion to record delivered files, passing validation commands, and the final observed behavior.
