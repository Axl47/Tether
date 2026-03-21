# Desktop browser/page panel split view

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository includes `.docs/PLANS.md`. This document must be maintained in accordance with `.docs/PLANS.md`.

## Purpose / Big Picture

After this change, the desktop app can open a browser pane beside an existing chat thread in split view, navigate to a page, inspect lightweight console/network activity, and push screenshots or log text into an existing thread draft without auto-sending. A contributor can verify the feature by opening the command palette on desktop, choosing the new browser split actions, browsing to a page, and then using the pane toolbar actions to stage artifacts into a thread draft.

## Progress

- [x] (2026-03-21 00:28Z) Reviewed the existing split-view, command palette, desktop preload/main process, draft composer, and keybinding architecture.
- [x] (2026-03-21 01:35Z) Generalized the split model and persisted workspace state so leaves can be thread or browser while keeping browser panes additive to thread-rooted workspaces.
- [x] (2026-03-21 01:53Z) Added browser IPC contracts, shared shortcut resolution exports, desktop preload/main IPC wiring, and an initial Electron `WebContentsView` browser pane manager.
- [x] (2026-03-21 02:09Z) Added a first browser pane runtime/UI, desktop-only command palette actions, browser shortcut rebroadcasting, and draft screenshot/log insertion flows.
- [ ] Run `rtk bun fmt`, `rtk PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun -b lint`, `rtk PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun typecheck`, and targeted `rtk bun run test` commands; update this plan with outcomes.

## Surprises & Discoveries

- Observation: the repo-level `rtk` wrapper is not currently on `PATH` in this container, so implementation-time inspection had to begin with raw shell commands before validation can be attempted with the required prefix once the wrapper is located or exposed.
  Evidence: `/bin/bash: line 1: rtk: command not found` from the first inspection command.

## Decision Log

- Decision: keep browser panes additive to the existing workspace model instead of introducing a separate desktop-only layout state.
  Rationale: the requested behavior depends on split persistence, focus movement, and workspace activation that already live in `apps/web/src/splitViewStore.ts`, so extending that store is lower risk than creating a parallel browser layout system.
  Date/Author: 2026-03-21 / Codex

## Outcomes & Retrospective

Implementation is mostly complete in the working tree, but full repository validation is still blocked in this container because the required `rtk` wrapper and Bun runtime are absent.

## Context and Orientation

The existing split system lives in `apps/web/src/splitViewStore.ts` and only supports thread leaves. The UI renderer for that tree is `apps/web/src/components/SplitPanel.tsx`, and the current chat route integration is in `apps/web/src/routes/_chat.$threadId.tsx`. The desktop app uses Electron with preload exposure in `apps/desktop/src/preload.ts` and main-process IPC/window management in `apps/desktop/src/main.ts`. The web app currently reaches desktop functionality indirectly through `window.desktopBridge`, which is wrapped into `NativeApi` by `apps/web/src/wsNativeApi.ts`. Draft text and image staging live in `apps/web/src/composerDraftStore.ts`.

A “browser pane” in this plan means a split-view leaf whose visible page content is an Electron `WebContentsView` owned by the desktop main process and positioned over a measured rectangle in the renderer. A “snapshot” means the browser pane’s current URL/state plus recent console/network ring-buffer contents, not a full browser session restore.

## Plan of Work

First, extend the contracts surface so both desktop preload code and the web app agree on browser pane method signatures and event payloads. At the same time, move the keybinding matcher into `packages/shared/src/keybindings.ts` so the browser-focused page view and the web renderer can resolve the same commands from the same shortcut configuration.

Second, generalize `apps/web/src/splitViewStore.ts` from thread-only leaves to pane leaves with discriminated metadata for thread and browser leaves, introduce v2 persistence/migration helpers, and preserve the existing thread-centric helper methods as wrappers around the broader pane operations. Browser leaves must only be created by splitting from a thread leaf so every workspace always retains at least one thread leaf.

Third, add `apps/desktop/src/browserPaneManager.ts` and wire it from `apps/desktop/src/main.ts` and `apps/desktop/src/preload.ts`. The manager must create one `WebContentsView` and one isolated ephemeral Electron session partition per pane id, keep page navigation restricted to `http:`, `https:`, and `about:blank`, proxy popup/unsafe-scheme navigation out to the OS, capture console/network activity into bounded buffers, expose screenshot capture and snapshots, and sync/emit browser events over IPC.

Fourth, add a small renderer-side runtime store and a `BrowserPane` component. The component must render toolbar/drawer UI in the DOM, measure the viewport host element with `ResizeObserver`, call the desktop bridge to position/show the native view, keep URL/title/loading state synchronized from browser events, and allow inserting screenshots or formatted log markdown into a target thread draft.

Fifth, update the command palette and chat route integration so browser panes render inside split view, desktop-only actions create them, browser-focused shortcut commands are bridged back into the same global/web handlers, and non-Electron hydration safely prunes browser panes.

## Concrete Steps

Run all commands from `/workspace/Tether`.

Create or update the feature plan and implementation files with ordinary shell redirection or patching.

Validate with:

    rtk bun fmt
    rtk PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun -b lint
    rtk PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun typecheck
    rtk bun run test --filter splitViewStore

If the root test filter is insufficient, run targeted package-local Vitest commands from `apps/web`, `apps/desktop`, or `packages/shared` and record the exact commands that passed.

## Validation and Acceptance

Acceptance requires the browser pane to open from the command palette on desktop, restore its URL and split placement after reload, keep browser logs ephemeral, allow screenshot/log insertion into a chosen thread draft without auto-send, and preserve the required keyboard shortcuts while the page is focused. Repository formatting, lint, typecheck, and targeted tests must pass.

## Idempotence and Recovery

The plan file and code edits are safe to reapply incrementally. If the persisted split-view migration causes bad local state during development, clearing the `t3code:workspaces:v2` localStorage entry is a safe recovery path because browser pane history/logs are intentionally ephemeral.

## Artifacts and Notes

Initial inspection commands used during orientation:

    find . -path '*/AGENTS.md' -print
    sed -n '1,240p' .docs/PLANS.md
    sed -n '1,260p' apps/web/src/splitViewStore.ts
    sed -n '1,260p' apps/desktop/src/main.ts

## Interfaces and Dependencies

Add a new contracts module at `packages/contracts/src/browser.ts` and re-export it from `packages/contracts/src/index.ts`. Extend `packages/contracts/src/ipc.ts` so `DesktopBridge` and `NativeApi` expose browser pane methods for create/destroy/bounds/visibility/navigation/screenshot/snapshot/event subscription/shortcut sync. Add shared shortcut helpers in `packages/shared/src/keybindings.ts` and export them from `packages/shared/package.json`. Add a desktop manager module at `apps/desktop/src/browserPaneManager.ts` that depends only on Electron and existing contracts/shared packages; do not add a second browser embedding dependency.

Revision note: Created on 2026-03-21 at implementation start so the browser pane work can be tracked as a living ExecPlan.

Revision note: Updated on 2026-03-21 after implementing the first end-to-end browser pane slice and recording the remaining environment validation limitation.
