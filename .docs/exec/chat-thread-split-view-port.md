# Port chat thread split view onto current main

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `.docs/PLANS.md`.

## Purpose / Big Picture

After this work, Tether should support opening multiple chat threads side by side in a split view, replacing the focused split pane from the command palette, and managing split-workspace state from the sidebar without regressing the command palette and filesystem-browse work already merged into this fork. A user should be able to drag threads or projects into pane edge drop zones, resize panes, close panes, and continue using the existing chat, project, and command palette flows on current `main`.

## Progress

- [x] (2026-03-20 22:48Z) Confirmed the source branch exists upstream at `Noojuno/t3code:t3code/chat-thread-split-view-2` and fetched it locally as `refs/remotes/noojuno/chat-thread-split-view-2`.
- [x] (2026-03-20 22:48Z) Created safety ref `safety/main-before-chat-thread-split-view-port` from current `main`.
- [x] (2026-03-20 22:48Z) Created working branch `codex/chat-thread-split-view-port` from current `main`.
- [x] (2026-03-20 22:48Z) Compared `main...noojuno/chat-thread-split-view-2` and confirmed the net port touches 31 files with heavy overlap in `apps/web/src/components/ChatView.tsx`, `apps/web/src/components/Sidebar.tsx`, `apps/web/src/components/CommandPalette.tsx`, `apps/web/src/routes/_chat.$threadId.tsx`, and new split-view stores/components.
- [x] (2026-03-20 23:35Z) Imported the split-view feature onto `codex/chat-thread-split-view-port`, resolved the overlapping route/command-palette/keybinding/sidebar conflicts, and kept the split-store files authored locally.
- [x] (2026-03-20 23:35Z) Preserved the current-main command palette, filesystem browse, queued-composer, and chat flows while layering in split-pane creation, replace-focused workflows, workspace-aware sidebar sections, and split-view route reconciliation.
- [x] (2026-03-20 23:35Z) Ran `bun fmt`, `bun -b lint`, `bun typecheck`, focused web/contracts tests, and the `ChatView.browser.tsx` browser suite; added `@base-ui/react/collapsible` to Vite optimize deps so the new sidebar workspace UI does not trigger a mid-suite browser reload.
- [ ] Commit the finished port with a conventional commit message.

## Surprises & Discoveries

- Observation: the compare branch is based on a much older fork state (`merge-base` `89ffcf42...`) and does not share our current recovery and command-palette merge history, so a direct history replay would be noisy and misleading.
  Evidence: `git log --left-right --cherry-pick main...noojuno/chat-thread-split-view-2` shows our current `main` ahead by many fork-specific commits and the fetched branch ahead by only the split-view stack.
- Observation: the upstream compare page reports 7 commits, 31 files changed, and 2 contributors, with the functional payload concentrated in split panes, workspace-aware sidebar state, and command palette integration.
  Evidence: GitHub compare page for `Axl47/Tether main...Noojuno:t3code/chat-thread-split-view-2` lists the commit summaries and file count.

## Decision Log

- Decision: port the feature onto a new local branch instead of editing `main` directly.
  Rationale: this keeps the integration reviewable and gives a safe place to resolve the large overlap with our already-merged command-palette work.
  Date/Author: 2026-03-20 / Codex
- Decision: preserve functionality, not authorship/history, from `noojuno/chat-thread-split-view-2`.
  Rationale: the user explicitly said these changes do not need upstream git history and can be authored locally.
  Date/Author: 2026-03-20 / Codex
- Decision: treat current `main` as canonical and port the split-view branch into it rather than trying to move `main` back toward the fetched branch’s older merge base.
  Rationale: current `main` already contains major Tether-specific fixes and the command-palette/filesystem-browse feature stack that the split-view branch partially overlaps with.
  Date/Author: 2026-03-20 / Codex

## Outcomes & Retrospective

The split-view feature now lives on top of current `main` as a local authored port instead of an upstream history replay. The final result keeps the newer Tether command palette and filesystem-browse behavior, adds split-pane creation/replacement from keyboard shortcuts and palette actions, renders split workspaces in the chat route, reconciles workspace state during thread-store updates, and restores the split-workspace section in the sidebar so users can reopen, rename, collapse, and close workspaces without losing the rest of the current sidebar UX.

Compared with the source branch, the biggest adaptation was around `Sidebar.tsx`, `CommandPalette.tsx`, `ChatView.tsx`, and `_chat.$threadId.tsx`, because current `main` already had newer project-search, queued-message, and command-palette behavior that could not simply be replaced wholesale. The browser test runner also needed a small config follow-up in `apps/web/vite.config.ts`: adding `@base-ui/react/collapsible` to `optimizeDeps.include` prevents Vite from re-optimizing dependencies mid-run now that the sidebar imports the collapsible primitive.

Validation that passed before commit:

- `rtk proxy env PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun fmt`
- `rtk proxy env PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun -b lint`
- `rtk proxy env PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun typecheck`
- `rtk proxy env PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun run --cwd apps/web test src/splitViewStore.test.ts src/components/commandPaletteGroups.test.ts src/diffRouteSearch.test.ts src/keybindings.test.ts src/components/chat/MessagesTimeline.test.tsx src/components/Sidebar.logic.test.ts`
- `rtk proxy env PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun run --cwd packages/contracts test src/keybindings.test.ts`
- `rtk proxy env PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun run --cwd apps/web test:browser src/components/ChatView.browser.tsx`

Follow-up work left for later, if desired: broader sidebar-specific UI coverage for workspace interactions, and possibly a dedicated browser test for split-workspace sidebar flows now that the core port is stable.

## Context and Orientation

The fetched source branch introduces a “split view,” which is the ability to render multiple chat panes at once and manage them as a tree of horizontal and vertical splits. In this repository, the main chat UI lives in `apps/web/src/components/ChatView.tsx`, the sidebar lives in `apps/web/src/components/Sidebar.tsx`, and the chat routes live in `apps/web/src/routes/_chat.tsx`, `apps/web/src/routes/_chat.index.tsx`, and `apps/web/src/routes/_chat.$threadId.tsx`. Shared keyboard shortcut contracts live in `packages/contracts/src/keybindings.ts` and are consumed by both `apps/server/src/keybindings.ts` and `apps/web/src/keybindings.ts`.

The fetched branch also introduces new split-view state and helpers in `apps/web/src/splitViewStore.ts`, a recursive pane renderer in `apps/web/src/components/SplitPanel.tsx`, command palette grouping helpers in `apps/web/src/components/commandPaletteGroups.ts`, and a small thread metadata helper in `apps/web/src/threadMeta.ts`. Current `main` already has a newer command palette implementation in `apps/web/src/components/CommandPalette.tsx`, a route-level `CommandPalette` wrapper in `apps/web/src/routes/_chat.tsx`, and filesystem browsing support across `packages/contracts`, `apps/server`, and `apps/web`. Those newer pieces must remain intact after the port.

The most likely conflict zones are:

1. `apps/web/src/components/ChatView.tsx`, where current `main` already contains Tether-specific header actions, queued follow-up handling, context-window indicators, and browser-test-backed layout behavior.
2. `apps/web/src/components/Sidebar.tsx`, where current `main` already contains command-palette launch affordances, project actions, and drag/reorder logic.
3. `apps/web/src/components/CommandPalette.tsx`, where the fetched branch adds split-pane actions and workspace-aware search/replace behavior on top of an older command palette base.
4. `apps/web/src/routes/_chat.$threadId.tsx`, `_chat.index.tsx`, and `_chat.tsx`, where the split-view route state must coexist with the existing command-palette wrapper and thread routing.

## Plan of Work

First, import the fetched branch into the working tree in a way that exposes conflicts clearly. A squash merge or equivalent tree application is acceptable because the user does not want upstream history preserved. Once the changes are present, resolve conflicts by preferring current `main` as the base whenever the same area was already modified by Tether-specific work, then layer in the split-view behavior from the fetched branch.

Implement the new split-view model by bringing over `apps/web/src/splitViewStore.ts`, `apps/web/src/splitViewStore.test.ts`, `apps/web/src/components/SplitPanel.tsx`, `apps/web/src/threadMeta.ts`, and `apps/web/src/lib/closeTerminalSession.ts`, then wire them into the chat routes and layout components. After that, adapt the command palette so it can create new panes, replace the focused pane, and perform workspace-aware actions without losing the current filesystem-browse and project-search behavior already in `main`.

Finally, reconcile sidebar and chat header behavior. The sidebar should manage split-workspace groups and active panes, while `ChatView.tsx` and the chat route files should render and update the split tree, focus state, and per-pane close/replace actions. Any browser tests carried over from the fetched branch must be updated to match the current Tether UI conventions instead of reverting current-main behavior.

## Concrete Steps

Work from `/Users/axel/Desktop/Code_Projects/Personal/Tether`.

1.  Import the source branch into the working branch and inspect conflicts.

    Expected command sequence:

        rtk proxy git merge --squash --autostash noojuno/chat-thread-split-view-2
        rtk proxy git status

    If the squash merge proves too noisy, retry by copying the fetched tree for only the new split-view files first, then resolve the overlapping files manually.

2.  Resolve conflicts and keep this plan updated as discoveries occur.

3.  Run required verification:

    rtk proxy env PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun fmt
    rtk proxy env PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun -b lint
    rtk proxy env PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun typecheck

4.  Run focused tests for changed areas. At minimum, cover the web/browser split-view and command-palette flows plus any touched contract/keybinding tests.

5.  Commit the result as one authored local commit once verification is green.

## Validation and Acceptance

Acceptance is behavioral, not just structural. After the port:

- Opening the app on the working branch should allow multiple threads to be shown in split panes.
- Dragging a thread or project into pane edge targets should create or update splits rather than only navigating the single active pane.
- The command palette should still open from its existing trigger and shortcut, while also offering split-pane actions such as replacing the focused pane or opening items into a new pane when appropriate.
- The sidebar should still support project and thread management while also reflecting split-workspace state.
- `bun fmt`, `bun -b lint`, and `bun typecheck` must pass, plus focused test coverage for the touched split-view/browser behavior.

## Idempotence and Recovery

All work happens on `codex/chat-thread-split-view-port`, so retrying is safe. If a merge attempt becomes too tangled, reset only this branch back to `main` by creating a fresh branch again from `safety/main-before-chat-thread-split-view-port`; do not rewrite `main`. Keep `working_list.md` changes outside the feature commit unless they are intentionally updated as part of the ongoing work log.

## Artifacts and Notes

Important discovery commands already run:

    rtk proxy git ls-remote https://github.com/Noojuno/t3code.git 'refs/heads/t3code/chat-thread-split-view-2'
    rtk proxy git fetch https://github.com/Noojuno/t3code.git refs/heads/t3code/chat-thread-split-view-2:refs/remotes/noojuno/chat-thread-split-view-2
    rtk proxy git diff --stat main...noojuno/chat-thread-split-view-2
    rtk proxy git log --oneline --left-right --cherry-pick main...noojuno/chat-thread-split-view-2

Observed diff summary at planning time:

    31 files changed
    ~5,138 insertions
    ~368 deletions

## Interfaces and Dependencies

The finished port must leave these interfaces in place:

- `packages/contracts/src/keybindings.ts` must continue to describe the keyboard commands used by both the server and the web app, while gaining any split-view-specific commands required by the feature.
- `apps/server/src/keybindings.ts` must continue to resolve the contract defaults for the desktop/server process.
- `apps/web/src/components/CommandPalette.tsx` must continue to support filesystem browsing and project search while adding split-aware actions.
- `apps/web/src/routes/_chat.tsx` must continue to wrap the chat layout in `CommandPalette`.
- `apps/web/src/components/ChatView.tsx` and `apps/web/src/components/chat/MessagesTimeline.tsx` must preserve existing Tether-specific chat behavior unless a split-view adaptation is explicitly required.

Revision note: created this ExecPlan after fetching and scoping `noojuno/chat-thread-split-view-2` so the implementation can proceed on a dedicated branch with a documented integration strategy.
