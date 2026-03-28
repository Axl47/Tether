# Pragma Thread/Project Desktop Integration

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows [`.docs/PLANS.md`](/Users/axel/Desktop/Code_Projects/Personal/Tether/.docs/PLANS.md). Keep this file current as implementation and verification proceed.

## Purpose / Big Picture

After this change, a Pragma desktop client can connect to Tether over the existing WebSocket endpoint, ask for the current orchestration snapshot and the latest desktop context, and reliably identify the currently focused Tether project and thread without reconnecting. The observable proof is: start Tether in either `bun run dev` or `bun run dev:desktop`, connect a WebSocket client, request `orchestration.getSnapshot` and `server.getDesktopContext`, then change the focused thread in the UI and observe `server.desktopContextUpdated` plus the existing `orchestration.domainEvent` traffic.

## Progress

- [x] (2026-03-27 20:05 AST) Read the current contracts, web desktop-context reporter, websocket server handlers, and existing tests.
- [x] (2026-03-27 20:12 AST) Implement focused desktop-context derivation edge-case handling and expand `apps/web/src/desktopContext.test.ts`.
- [x] (2026-03-27 20:13 AST) Strengthen `apps/server/src/wsServer.test.ts` for empty context, populated context, no-op rebroadcast suppression, and changed rebroadcast behavior.
- [x] (2026-03-27 20:14 AST) Run targeted tests for `apps/web/src/desktopContext.test.ts` and `apps/server/src/wsServer.test.ts`.
- [x] (2026-03-27 20:15 AST) Run repository verification commands: `bun fmt`, `bun lint`, and `bun typecheck`.

## Surprises & Discoveries

- Observation: The required RPC methods and push channels already exist in the checked-in contracts and server routes.
  Evidence: `packages/contracts/src/server.ts`, `packages/contracts/src/ws.ts`, and `apps/server/src/wsServer.ts` already define and route `server.getDesktopContext`, `server.setDesktopContext`, and `server.desktopContextUpdated`.
- Observation: The web app already reports desktop context from the router, but the current logic is minimal and only covered by a small unit test.
  Evidence: `apps/web/src/desktopContext.ts` and `apps/web/src/routes/__root.tsx`.
- Observation: The server already used effective-field equality for desktop-context broadcast suppression; the missing part was test coverage, not runtime behavior.
  Evidence: `apps/server/src/wsServer.ts` compares `projectId`, `projectTitle`, `workspaceRoot`, `threadId`, and `threadTitle` while ignoring `updatedAt`.

## Decision Log

- Decision: Keep the existing websocket method names and push channels instead of introducing Pragma-specific routes.
  Rationale: Pragma already expects the current Tether contract. The safest implementation is to harden the existing path and increase coverage.
  Date/Author: 2026-03-27 / Codex
- Decision: Derive desktop context from the focused thread identity already represented in Tether state, then send that over `server.setDesktopContext`.
  Rationale: This keeps project identity aligned with the same `orchestration.getSnapshot` data Pragma also consumes, which is what preserves stable `projectId`, `workspaceRoot`, and current `projectTitle`.
  Date/Author: 2026-03-27 / Codex

## Outcomes & Retrospective

Completed. The final implementation keeps the orchestration snapshot as the source of truth for stable project identity and uses the existing server-side in-memory desktop-context store for the currently focused thread and project. The main code changes were small because the core plumbing already existed. The real gap was confidence: the web derivation helper now has explicit edge-case coverage, and the websocket server tests now prove empty context, populated context, store persistence across requests, no-op suppression, and changed rebroadcasts.

This satisfies the requested behavior for both `bun run dev` and `bun run dev:desktop` because both modes already use the same `readNativeApi()` fallback path in the browser and the same websocket server contracts on the backend.

## Context and Orientation

Tether’s shared WebSocket contracts live in `packages/contracts/src`. `packages/contracts/src/server.ts` defines the desktop-context shapes and `packages/contracts/src/ws.ts` defines RPC method tags and push channel names. The server WebSocket implementation is `apps/server/src/wsServer.ts`. It owns request routing, push broadcasting, and the current in-memory desktop-context value for connected clients. The web app bootstraps from `apps/web/src/routes/__root.tsx`, which subscribes to orchestration events, keeps the client store synchronized, and already contains a `DesktopContextReporter` component that calls `server.setDesktopContext`.

In this repository, an orchestration snapshot is the read model returned by `orchestration.getSnapshot`. It includes `projects` and `threads`, and the web store maps those projection records into UI models in `apps/web/src/store.ts`. A project’s stable identity is the `id` from the snapshot. The project title is `title` in the snapshot and `name` in the web store. The canonical workspace path is `workspaceRoot` in the snapshot and `cwd` in the web store. The server already normalizes project workspace roots on orchestration commands inside `apps/server/src/wsServer.ts`, which means the safest desktop-context implementation is to reuse those same mapped values instead of inventing a second normalization path in the browser.

The tests that matter are `apps/web/src/desktopContext.test.ts` for derivation, `apps/server/src/wsServer.test.ts` for RPC and push behavior, and `apps/server/src/orchestration/Layers/ProjectionSnapshotQuery.test.ts` for snapshot identity fields. Repository-level completion also requires `bun fmt`, `bun lint`, and `bun typecheck` from the repository root, using the wrapper commands described in `AGENTS.md`.

## Plan of Work

First, update `apps/web/src/desktopContext.ts` so the derivation helper clearly models the focused route and returns the exact null-or-populated payload Pragma expects. Keep the output limited to the desktop-context input shape, using project `id`, project `name`, project `cwd`, thread `id`, and thread `title`. Add unit coverage in `apps/web/src/desktopContext.test.ts` for empty context, populated context, and route cases that should resolve to nulls.

Next, adjust `apps/web/src/routes/__root.tsx` only as needed so `DesktopContextReporter` continues to call `server.setDesktopContext` whenever the effective focused context changes, while avoiding duplicate sends when the serialized payload is unchanged.

Then, expand `apps/server/src/wsServer.test.ts` so the server behavior is locked down: initial empty context returns null fields, populated context is returned with `updatedAt`, a repeated identical `server.setDesktopContext` call does not rebroadcast `server.desktopContextUpdated`, and a changed payload does rebroadcast it. Keep `apps/server/src/wsServer.ts` using the in-memory latest desktop-context store, stamping `updatedAt` server-side and comparing only effective identity fields before broadcasting.

Finally, confirm snapshot identity coverage remains accurate. If existing snapshot tests already verify `id`, `title`, and `workspaceRoot`, leave the implementation alone and note that coverage. If there is a gap, add or refine a targeted assertion in `apps/server/src/orchestration/Layers/ProjectionSnapshotQuery.test.ts`.

## Concrete Steps

Run these commands from `/Users/axel/Desktop/Code_Projects/Personal/Tether`.

Inspect the relevant files before editing:

    rtk sed -n '1,260p' packages/contracts/src/server.ts
    rtk sed -n '1,260p' packages/contracts/src/ws.ts
    rtk sed -n '1,320p' apps/server/src/wsServer.ts
    rtk sed -n '1,260p' apps/web/src/desktopContext.ts
    rtk sed -n '1,260p' apps/web/src/routes/__root.tsx

After the edits, run the repository verification commands required by `AGENTS.md`:

    rtk bun fmt
    PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun -b lint
    PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun typecheck

Expected outcome: all three commands exit successfully without new diagnostics. If a formatter changes files, rerun lint and typecheck after formatting.

Commands executed during implementation:

    rtk proxy env PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun run test -- src/desktopContext.test.ts
    rtk proxy env PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun run test -- src/wsServer.test.ts
    rtk proxy env PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun run fmt
    rtk proxy env PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun -b lint
    rtk proxy env PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun typecheck

Observed results:

    - `apps/web/src/desktopContext.test.ts`: 4 tests passed.
    - `apps/server/src/wsServer.test.ts`: 46 tests passed.
    - `bun fmt`: completed successfully.
    - `bun lint`: 0 warnings, 0 errors.
    - `bun typecheck`: 7 successful tasks.

## Validation and Acceptance

Acceptance is behavior, not just compilation.

Start Tether in browser mode with:

    rtk bun run dev

Open the app, focus a thread, and confirm a WebSocket client can request:

    { "id": "req-1", "body": { "_tag": "orchestration.getSnapshot" } }
    { "id": "req-2", "body": { "_tag": "server.getDesktopContext" } }

The snapshot response must include at least one project with stable `id`, current `title`, and canonical `workspaceRoot`. The desktop-context response must contain either all `null` identity fields or the focused project/thread values plus a server-generated `updatedAt`.

Then switch to another thread or project in the UI and confirm the connected client receives a `server.desktopContextUpdated` push only when the effective context changed. Existing `orchestration.domainEvent` pushes should continue whenever orchestration state changes, because Pragma uses that channel as a generic signal that `orchestration.getSnapshot` may now differ.

Repeat the same validation while running:

    rtk bun run dev:desktop

The same RPC and push behavior must hold in both modes.

## Idempotence and Recovery

The plan is additive and safe to repeat. Re-running `server.setDesktopContext` with the same payload should not produce duplicate `server.desktopContextUpdated` pushes; this is part of the intended behavior and is covered by tests. If formatting rewrites files, rerun lint and typecheck. If a verification command fails because of unrelated pre-existing worktree issues, record the failure in this document rather than silently changing unrelated code.

## Artifacts and Notes

Important proof points to capture during implementation:

    - `apps/web/src/desktopContext.test.ts` shows null-versus-populated derivation.
    - `apps/server/src/wsServer.test.ts` shows initial empty context, changed update broadcast, and no-op update suppression.
    - `apps/server/src/orchestration/Layers/ProjectionSnapshotQuery.test.ts` shows snapshot `projects` rows still expose `id`, `title`, and `workspaceRoot`.

## Interfaces and Dependencies

Keep these interfaces stable:

In `packages/contracts/src/server.ts`, the following shapes must continue to exist:

    ServerDesktopContext = {
      projectId: ProjectId | null
      projectTitle: string | null
      workspaceRoot: string | null
      threadId: ThreadId | null
      threadTitle: string | null
      updatedAt: IsoDateTime
    }

    ServerSetDesktopContextInput = {
      projectId: ProjectId | null
      projectTitle: string | null
      workspaceRoot: string | null
      threadId: ThreadId | null
      threadTitle: string | null
    }

In `packages/contracts/src/ws.ts`, keep:

    WS_METHODS.serverGetDesktopContext = "server.getDesktopContext"
    WS_METHODS.serverSetDesktopContext = "server.setDesktopContext"
    WS_CHANNELS.serverDesktopContextUpdated = "server.desktopContextUpdated"
    ORCHESTRATION_WS_METHODS.getSnapshot = "orchestration.getSnapshot"
    ORCHESTRATION_WS_CHANNELS.domainEvent = "orchestration.domainEvent"

In `apps/server/src/wsServer.ts`, the request router must continue to:

    - return the latest in-memory desktop context for `server.getDesktopContext`
    - stamp `updatedAt` server-side for `server.setDesktopContext`
    - broadcast `server.desktopContextUpdated` only when effective fields changed

Revision note: created on 2026-03-27 to implement the Tether side of Pragma desktop integration using the already existing snapshot and desktop-context APIs.

Revision note (2026-03-27): updated after implementation to record the exact test and verification commands that passed, and to note that the primary gap was missing coverage rather than missing server runtime behavior.
