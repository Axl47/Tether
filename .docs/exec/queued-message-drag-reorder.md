# Drag Reordering For Queued Follow-Up Messages

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository includes `.docs/PLANS.md`. This document must be maintained in accordance with `.docs/PLANS.md`.

## Purpose / Big Picture

After this change, queued follow-up cards above the composer will show a drag handle instead of the current directional queue icon, and the user will be able to drag queued items into a new order before they are dispatched. The first queued card remains the next item to send, so dragging a later queued prompt to the top should immediately change which follow-up goes out next when the active run settles or when the user chooses `Steer`.

The visible proof is simple. Queue at least two follow-up prompts while a thread is running. The left edge of each queued card should show a drag-style icon. Drag the second card above the first. The list should reorder in place, the `Queued next` label should move with the new head item, and the updated order should be reflected in the persisted queue state used by auto-dispatch and steering.

## Progress

- [x] (2026-03-09 02:07Z) Read `.docs/PLANS.md`, the existing queued follow-up ExecPlan, `apps/web/src/components/ChatView.tsx`, `apps/web/src/composerDraftStore.ts`, and the related tests to define the implementation boundary.
- [x] (2026-03-09 02:14Z) Add a persisted `moveQueuedMessage` store action in `apps/web/src/composerDraftStore.ts` and cover it in `apps/web/src/composerDraftStore.test.ts`.
- [x] (2026-03-09 02:14Z) Replace the queued-card leading icon with a drag handle and implement drag/drop reorder behavior in `apps/web/src/components/ChatView.tsx`.
- [x] (2026-03-09 02:14Z) Add browser coverage in `apps/web/src/components/ChatView.browser.tsx` for reordering and run the required validation commands.
- [x] (2026-03-09 02:14Z) Fix queued-dispatch handoff state in `apps/web/src/components/QueuedTurnDispatcher.tsx` after the browser suite exposed a pre-send working-indicator gap.

## Surprises & Discoveries

- Observation: The queue store currently supports append, delete, consume, and "promote to head", but not arbitrary movement between indices.
  Evidence: `apps/web/src/composerDraftStore.ts` exposes `enqueueQueuedMessage`, `removeQueuedMessage`, `promoteQueuedMessage`, `consumeQueuedMessage`, and `loadQueuedMessageIntoComposer`, with no move/reorder API.

- Observation: The existing queued-dispatch browser suite exposed a lifecycle bug where the UI cleared its "dispatch in flight" state as soon as the queue item was consumed, before the server marked the thread as running.
  Evidence: `src/components/ChatView.browser.tsx > keeps the thread in a working state while a queued send is handing off to the server` failed until `QueuedTurnDispatcher.tsx` preserved `dispatchingQueuedMessageIdByThreadId` through the ready-to-running handoff.

## Decision Log

- Decision: Implement reordering as a first-class `composerDraftStore` action instead of keeping the order only in `ChatView` component state.
  Rationale: queued auto-dispatch, steering, persistence, and the browser tests already consume store order directly, so the canonical order must live in the persisted queue state.
  Date/Author: 2026-03-09 / Codex

- Decision: Use native HTML drag-and-drop events on the queued cards rather than introducing a new drag library.
  Rationale: the interaction is a simple single-list reorder inside one component, and avoiding a dependency keeps bundle cost and failure modes down.
  Date/Author: 2026-03-09 / Codex

## Outcomes & Retrospective

Queued follow-up cards now show a drag handle and can be reordered with native drag-and-drop, with the queue order persisted in `composerDraftStore` so `Queued next`, `Steer`, and auto-dispatch all follow the same updated order. The work also fixed a queued-dispatch handoff bug in `QueuedTurnDispatcher.tsx`, ensuring the thread remains visibly working while a queued send has been issued locally but the server has not yet reported the new running state.

Validation completed with a focused store test, the full `ChatView.browser.tsx` browser suite, `PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun -b lint`, and `PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun typecheck`.

## Context and Orientation

Queued follow-up state lives in `apps/web/src/composerDraftStore.ts`. This file defines the persisted Zustand store used by the composer and the queued-message UI. A queued message is a stored snapshot of a follow-up prompt, plus attachments and model/runtime selections, keyed by thread id inside `queuedMessagesByThreadId`.

The queued message cards are rendered in `apps/web/src/components/ChatView.tsx` above the composer. The current markup shows a left icon inside a circular badge, then a label and preview, then action buttons for `Steer`, edit, and delete. The card order is the same order read from `queuedMessagesByThreadId[threadId]`, and the first item is labeled `Queued next`.

Behavioral coverage already exists in two test files. `apps/web/src/composerDraftStore.test.ts` verifies queue ordering and queue-specific store actions. `apps/web/src/components/ChatView.browser.tsx` mounts the routed app shell in a browser-like environment and exercises queue actions against real DOM nodes and the shared store. Reordering should be validated in both places so the state and UI stay aligned.

## Plan of Work

First, extend `apps/web/src/composerDraftStore.ts` with a new action that moves one queued item from a source index to a destination index inside a single thread queue. The action must no-op when the thread id is empty, the queue does not exist, the indices are invalid, or the move would not change the order. The queue contents themselves should not be copied deeply beyond the existing array move because queued message snapshots are already cloned on insertion.

Second, add a focused store test in `apps/web/src/composerDraftStore.test.ts` that proves arbitrary reordering works without affecting other threads. The test should enqueue at least three items, move the tail item into the middle or head, and assert the resulting id order.

Third, update the queued card markup in `apps/web/src/components/ChatView.tsx`. Replace the current left icon with a drag-handle icon from the existing Lucide icon set. Make either the handle or the whole card draggable, track the dragged queued message id locally, and move the dragged item when it is dropped on another queued card. The hover/drop styling should be minimal and should not interfere with existing action buttons.

Finally, add browser coverage in `apps/web/src/components/ChatView.browser.tsx`. Queue multiple prompts, dispatch the drag/drop events between two queued cards, and assert that `useComposerDraftStore.getState().queuedMessagesByThreadId[THREAD_ID]` reflects the new order. After that, run the required repository validation commands from the root.

## Concrete Steps

Run all commands from the repository root, `/Users/axel/Desktop/Code_Projects/Personal/Tether`.

Read the relevant files before editing:

    sed -n '1480,1605p' apps/web/src/composerDraftStore.ts
    sed -n '4190,4335p' apps/web/src/components/ChatView.tsx
    sed -n '498,575p' apps/web/src/composerDraftStore.test.ts
    sed -n '1388,1525p' apps/web/src/components/ChatView.browser.tsx

After implementing the store action and store test, run:

    PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun run test apps/web/src/composerDraftStore.test.ts

After implementing the browser interaction, run:

    PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun run test:browser apps/web/src/components/ChatView.browser.tsx

Run required repository validation:

    PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun -b lint
    PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun typecheck

Expected success means the targeted Vitest suites pass, then lint and typecheck complete with no errors.

## Validation and Acceptance

Acceptance is user-visible. While a thread is running, queue two or more follow-up prompts. Each queued card should show a drag-style handle on the left. Dragging a later card above an earlier one should reorder the cards immediately. The new first card should change to the `Queued next` badge, and subsequent steering or automatic dispatch should use the updated order because the store order changed.

Automated acceptance requires the queue move test in `apps/web/src/composerDraftStore.test.ts` and the new browser reordering scenario in `apps/web/src/components/ChatView.browser.tsx` to pass, along with `PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun -b lint` and `PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun typecheck`.

## Idempotence and Recovery

These edits are additive and safe to rerun. If drag/drop behavior fails during development, the safe recovery path is to re-run the focused test that failed, inspect the queue order in `useComposerDraftStore.getState()`, and adjust the move logic without touching unrelated queue actions. No destructive migration is required because the persisted queue shape is unchanged; only the mutation API expands.

## Artifacts and Notes

The most important current hooks are:

    apps/web/src/composerDraftStore.ts
      `promoteQueuedMessage`
      `consumeQueuedMessage`
      `loadQueuedMessageIntoComposer`

    apps/web/src/components/ChatView.tsx
      Queued card rendering inside the composer footer region.

    apps/web/src/components/ChatView.browser.tsx
      Existing queue action scenarios that already queue prompts and assert store order.

## Interfaces and Dependencies

In `apps/web/src/composerDraftStore.ts`, the store API must include:

    moveQueuedMessage(threadId: ThreadId, fromIndex: number, toIndex: number): void

This action must preserve the queued message objects and only mutate order within `queuedMessagesByThreadId[threadId]`.

In `apps/web/src/components/ChatView.tsx`, use the existing `lucide-react` dependency for the drag handle icon and native React drag event handlers on the queued-card markup. No new package dependency should be introduced.

Revision note: Updated on 2026-03-09 after implementation to record the delivered drag-reorder flow, the queued-dispatch handoff fix discovered during browser testing, and the final validation commands.
