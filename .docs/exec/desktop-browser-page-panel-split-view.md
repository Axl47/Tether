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
- [x] (2026-03-21 02:55Z) Confirmed the first implementation slice is functionally incomplete: panes load and emit events, but the native page surface does not render reliably in the workspace.
- [x] (2026-03-21 07:32Z) Rewrote the desktop browser compositor around dedicated app/overlay native stages, added a central renderer layout coordinator, and restored deterministic desktop/browser smoke coverage.
- [x] (2026-03-21 07:32Z) Revalidated the rewrite with `bun fmt`, `bun -b lint`, `bun typecheck`, focused web tests, desktop tests, and the browser smoke test.

## Surprises & Discoveries

- Observation: the repo-level `rtk` wrapper is not currently on `PATH` in this container, so implementation-time inspection had to begin with raw shell commands before validation can be attempted with the required prefix once the wrapper is located or exposed.
  Evidence: `/bin/bash: line 1: rtk: command not found` from the first inspection command.
- Observation: the current browser pane bug is not a data-loading failure. Console/network events, navigation state, and screenshot capture all work while the visible pane area remains blank.
  Evidence: manual verification in desktop dev showed a blank host area alongside working browser snapshots/logs, and repeated bounds/parenting fixes did not restore visible painting.
- Observation: the desktop/browser investigation was partially obscured by toolchain drift in dev scripts. On this machine, plain `tsdown`, Vite, and Vitest invocations were still falling through to Node 19 instead of Bun, which caused stale artifacts, broken `dev:desktop`, and misleading startup failures.
  Evidence: `bun run dev:desktop` and package-local `bun run test` failed with `node:util` `styleText` errors until the scripts were updated to `bun --bun ./node_modules/.bin/...`.

## Decision Log

- Decision: keep browser panes additive to the existing workspace model instead of introducing a separate desktop-only layout state.
  Rationale: the requested behavior depends on split persistence, focus movement, and workspace activation that already live in `apps/web/src/splitViewStore.ts`, so extending that store is lower risk than creating a parallel browser layout system.
  Date/Author: 2026-03-21 / Codex
- Decision: stop incrementally patching the original browser-pane composition path and instead rewrite the desktop compositor around a dedicated native overlay stage.
  Rationale: repeated fixes to bounds sync, pane parenting, and window class selection left the page surface blank while the browser process continued to load pages correctly, which indicates an architectural composition problem rather than a single missing event or measurement.
  Date/Author: 2026-03-21 / Codex
- Decision: keep the split-pane UX and stay on Electron’s supported `BaseWindow` plus `WebContentsView` path, but make rendering-first the acceptance gate before relying on logs/screenshot tooling.
  Rationale: the user wants the embedded split experience, but the feature is not shippable until the native page surface is visible and interactive. The supporting browser tooling already works well enough to layer back onto a stable compositor once rendering is fixed.
  Date/Author: 2026-03-21 / Codex
- Decision: wrap both the app web contents and browser panes in explicit native stage `View`s instead of mounting the app `WebContentsView` directly under the window root.
  Rationale: the blank-pane symptom was consistent with a native z-order/composition mismatch between direct-root `WebContentsView`s and overlay child views. Normalizing both sides into sibling stage views removes that special-case layering risk and better matches the intended architecture.
  Date/Author: 2026-03-21 / Codex

## Outcomes & Retrospective

The first end-to-end slice established the product surface, IPC, persistence, and draft flows, but it did not produce a reliable visible browser surface. The rewrite replaced the native composition tree with explicit app/overlay stages, moved renderer measurements into a central layout coordinator, added a deterministic browser composition smoke probe, and cleaned up Bun-backed workspace scripts so the feature can be exercised reliably in dev on this machine.

## Context and Orientation

The existing split system lives in `apps/web/src/splitViewStore.ts` and only supports thread leaves. The UI renderer for that tree is `apps/web/src/components/SplitPanel.tsx`, and the current chat route integration is in `apps/web/src/routes/_chat.$threadId.tsx`. The desktop app uses Electron with preload exposure in `apps/desktop/src/preload.ts` and main-process IPC/window management in `apps/desktop/src/main.ts`. The web app currently reaches desktop functionality indirectly through `window.desktopBridge`, which is wrapped into `NativeApi` by `apps/web/src/wsNativeApi.ts`. Draft text and image staging live in `apps/web/src/composerDraftStore.ts`.

A “browser pane” in this plan means a split-view leaf whose visible page content is an Electron `WebContentsView` owned by the desktop main process and positioned over a measured rectangle in the renderer. A “snapshot” means the browser pane’s current URL/state plus recent console/network ring-buffer contents, not a full browser session restore.

## Plan of Work

First, replace the desktop composition structure in `apps/desktop/src/main.ts` so the `BaseWindow` contains one app `WebContentsView` plus one dedicated transparent overlay `View` that owns all browser pane containers. The overlay must always match the content bounds of the window and sit above the app view in z-order.

Second, rewrite `apps/desktop/src/browserPaneManager.ts` so each browser pane owns a lightweight container `View` plus its page `WebContentsView`. The container is attached to the shared overlay stage, clips the page surface, and receives absolute bounds from the renderer. The page `WebContentsView` is then positioned relative to that container instead of being moved directly around the root window.

Third, keep the existing browser IPC contract and browser state plumbing, but move renderer layout syncing out of per-pane animation loops. Add a new renderer-only coordinator module that batches all browser pane host measurements and sends the final viewport rectangles to desktop on resize, split changes, scroll, and mount/unmount.

Fourth, keep `apps/web/src/components/BrowserPane.tsx` focused on toolbar, drawers, and draft actions. It should register its host with the new coordinator, keep snapshot state synchronized, and stop owning native bounds polling directly.

Fifth, add a deterministic desktop/browser verification path. Extend the desktop smoke tooling so it can launch the app with a known browser pane target page and verify that the rewritten pane manager can render and capture a non-empty page image, then keep the existing web split-view tests plus new coordinator tests passing.

## Concrete Steps

Run all commands from `/workspace/Tether`.

Create or update the feature plan and implementation files with ordinary shell redirection or patching.

Validate with:

    rtk bun fmt
    rtk PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun -b lint
    rtk PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun typecheck
    rtk bun run test --filter splitViewStore

If the root test filter is insufficient, run targeted package-local Vitest commands from `apps/web`, `apps/desktop`, or `packages/shared` and record the exact commands that passed. Also run the desktop smoke test once the composition probe exists and record the exact environment variables and output that demonstrate the browser pane render path.

## Validation and Acceptance

Acceptance requires the browser pane to open from the command palette on desktop and visibly render a page inside the split workspace. The pane must remain interactive during split resize/reposition, restore its URL and placement after reload, keep browser logs ephemeral, allow screenshot/log insertion into a chosen thread draft without auto-send, and preserve the required keyboard shortcuts while the page is focused. Repository formatting, lint, typecheck, targeted tests, and the desktop browser smoke check must pass.

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

Revision note: Updated on 2026-03-21 after discovering that the first `WebContentsView` composition approach loads pages without reliably painting them, which changes the next milestone from incremental fixes to a compositor rewrite.
