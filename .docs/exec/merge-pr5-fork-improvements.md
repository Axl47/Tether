# Merge PR #5 Into Tether Main Without Regressing Local UX

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository includes `.docs/PLANS.md`. This document must be maintained in accordance with `.docs/PLANS.md`.

## Purpose / Big Picture

After this work, Tether `main` will absorb GitHub PR `#5` from the sibling fork while keeping the local Tether-specific UX and tooling changes that landed after the shared base. The merged result must include the new provider/runtime capabilities and thread UX from the fork, without regressing queued follow-ups, multi-terminal project actions, project drag behavior, orange awaiting-input indicators, plan-toggle placement, or Tether branding/env naming.

The visible proof is concrete. The merge branch should contain no conflict markers, the local sidebar and queued-follow-up behaviors should still work, the new provider/runtime surfaces from PR `#5` should build cleanly, and the required validation commands from `AGENTS.md` must pass.

## Progress

- [x] (2026-03-12 10:00Z) Confirmed the worktree is clean on `main`, fetched PR `#5` into `refs/remotes/origin/pr-5`, and previewed the merge conflict set with `git merge-tree`.
- [x] (2026-03-12 10:02Z) Chose full-scope integration: merge the complete PR `#5` feature set, not a subset.
- [x] (2026-03-12 10:05Z) Created `working_list.md` and this ExecPlan.
- [ ] Create branch `codex/merge-pr5-fork-improvements` from current `main`.
- [ ] Merge `refs/remotes/origin/pr-5` and document the actual conflicts encountered.
- [ ] Resolve contract/server/tooling conflicts while preserving `ProjectScript.steps`, `projects.readFile`, and `TETHER_*` naming.
- [ ] Resolve web conflicts while preserving queued follow-ups, drag reorder, multi-terminal project actions, project drag-and-drop, and orange awaiting-input styling.
- [ ] Run targeted tests and required validation commands.
- [ ] Commit the final merge result with a Conventional Commit message.

## Surprises & Discoveries

- Observation: current `main` already includes the earlier upstream integration branch, so this work is a sibling-branch merge from a shared post-upstream base rather than a first-time upstream sync.
  Evidence: `git merge-base HEAD refs/remotes/origin/pr-5` resolved to `1031a226f8cf90d358d9768fc0842dcdae61a315`.

- Observation: the forced conflict set is much smaller than the full overlap set, so most of the PR should come in automatically once the hand-resolved files are handled carefully.
  Evidence: `git merge-tree --write-tree --name-only HEAD refs/remotes/origin/pr-5` reported 22 conflict files.

## Decision Log

- Decision: perform the merge on a fresh branch named `codex/merge-pr5-fork-improvements`.
  Rationale: branch isolation keeps `main` clean while we resolve a large set of semantic conflicts and rerun validation.
  Date/Author: 2026-03-12 / Codex

- Decision: treat PR `#5` as the default winner for new provider/runtime functionality and thread UX, then reapply the known Tether-only deltas explicitly.
  Rationale: PR `#5` adds the entire provider expansion and several large chat/sidebar improvements that would be error-prone to reconstruct manually from the local side.
  Date/Author: 2026-03-12 / Codex

- Decision: keep `TETHER_*` as the public env and branding contract.
  Rationale: current `main`, docs, tests, and tooling already use `TETHER_*`, so PR-introduced `T3CODE_*` user-facing names are stale in this fork.
  Date/Author: 2026-03-12 / Codex

## Outcomes & Retrospective

Pending implementation.

## Context and Orientation

The highest-risk overlap is concentrated in three surfaces. First, shared contracts and server wiring in `packages/contracts/src/ws.ts`, `apps/server/src/serverLayers.ts`, and the provider/orchestration layers now need to expose both the local project-action RPC additions and the fork’s expanded provider/runtime model. Second, the main thread screen in `apps/web/src/components/ChatView.tsx`, the persisted composer store in `apps/web/src/composerDraftStore.ts`, and root event routing in `apps/web/src/routes/__root.tsx` now combine two independent lines of work: PR `#5` adds thread context, context-window status, timeline UX, and mobile improvements, while local Tether work adds queued follow-ups and multi-terminal project actions. Third, the sidebar and tooling layers contain branding-sensitive changes: `apps/web/src/components/Sidebar.tsx`, `scripts/dev-runner.ts`, `apps/web/vite.config.ts`, `turbo.json`, and `README.md` must keep the Tether rename and local sidebar fixes while still absorbing the fork’s new behavior.

The local-only features that must survive are already documented in checked-in ExecPlans. `.docs/exec/queued-follow-up-messages.md` describes the persisted queued-message model and root `QueuedTurnDispatcher`. `.docs/exec/queued-message-drag-reorder.md` adds queue reordering and the dispatch handoff fix. `.docs/exec/multi-terminal-project-actions.md` adds `ProjectScript.steps`, `projects.readFile`, and the launch planner that expands compatible React Native actions into multiple integrated terminals.

## Plan of Work

First, create `codex/merge-pr5-fork-improvements` from the current `main`, then perform a real merge of `refs/remotes/origin/pr-5` so Git writes conflict markers into the working tree. Record the actual conflict set in this plan and `working_list.md`.

Second, resolve contracts and server/tooling conflicts. In `packages/contracts/src/ws.ts`, keep the local `projects.readFile` method and request tagging while preserving the rest of the merged PR contract surface. In `apps/server/src/serverLayers.ts`, keep the fork’s added Claude/Gemini adapters and thread-management layers. In `apps/server/src/provider/Layers/ProviderService.ts` and `apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts`, prefer the PR implementation, then re-check any local provider-options persistence assumptions. In `scripts/dev-runner.ts`, `apps/web/vite.config.ts`, `turbo.json`, and related tests, port the fork’s host/bind improvements using `TETHER_*` names, not `T3CODE_*`.

Third, resolve the web conflicts by starting from the PR side and reapplying local Tether deltas. `apps/web/src/composerDraftStore.ts` must retain the queued-message store shape and actions. `apps/web/src/routes/__root.tsx` must keep `QueuedTurnDispatcher` alongside the PR event routing. `apps/web/src/components/ChatView.tsx` must keep the PR’s thread-context, timeline, rendering, and mobile changes while restoring queued follow-ups, drag reorder, multi-terminal project actions, and the plan-toggle placement in header actions. `apps/web/src/components/Sidebar.tsx` and `apps/web/src/components/Sidebar.logic.ts` must keep the PR’s paused-thread/search/sort/mobile changes while preserving local project drag-and-drop behavior, orange awaiting-input styling, and queued-dispatch working semantics.

Finally, scan touched files for reintroduced repo-owned `T3Code` naming, run the targeted test suites, then run `bun fmt`, `bun lint`, and `bun typecheck` exactly as required by `AGENTS.md`. Once the branch is green, create a Conventional Commit summarizing the merge.

## Concrete Steps

Run all commands from `/Users/axel/Desktop/Code_Projects/Personal/Tether`.

Create the branch and merge:

    rtk git checkout -b codex/merge-pr5-fork-improvements
    rtk git fetch origin refs/pull/5/head:refs/remotes/origin/pr-5
    rtk git merge --no-ff refs/remotes/origin/pr-5

Inspect the merge state and conflict markers:

    rtk git status --short
    rtk git diff --check
    rtk proxy bash -lc 'git grep -n "<<<<<<<\\|=======\\|>>>>>>>" || true'

Run focused tests after conflict resolution:

    rtk proxy env PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun run test apps/server/src/codexAppServerManager.test.ts apps/server/src/orchestration/Layers/ProviderCommandReactor.test.ts apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.test.ts apps/server/src/wsServer.test.ts apps/server/src/provider/Layers/ProviderAdapterRegistry.test.ts
    rtk proxy env PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun run test packages/contracts/src/orchestration.test.ts packages/contracts/src/ws.test.ts
    rtk proxy env PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun run test apps/web/src/composerDraftStore.test.ts apps/web/src/components/Sidebar.logic.test.ts apps/web/src/wsNativeApi.test.ts
    rtk proxy env PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun run test:browser apps/web/src/components/ChatView.browser.tsx

Run required completion checks:

    rtk proxy env PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun fmt
    rtk proxy env PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun -b lint
    rtk proxy env PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun typecheck

## Validation and Acceptance

Acceptance requires a clean merge on `codex/merge-pr5-fork-improvements`, no unresolved conflict markers, passing targeted tests, and passing `bun fmt`, `bun lint`, and `bun typecheck`.

Manual checks must confirm the merged app still supports project drag/reorder, thread search/sort, autorename, paused-thread visibility, orange awaiting-input pills, queued follow-up queueing/reordering/steering, multi-terminal project actions using `projects.readFile`, context window indicators, thread context jump, timeline markers, inline images, and Tether-branded user-facing text/env names.

## Idempotence and Recovery

The fetch and inspection steps are safe to repeat. If the merge becomes unsalvageable, abort it on the integration branch and recreate the branch from `main`; do not reset `main` or any shared branch. If a single conflict resolution is wrong, restore only that file from the merge stages and retry. The local-only features called out in the checked-in ExecPlans are the source of truth for reapplying Tether behavior after conflict resolution.

## Artifacts and Notes

Predicted forced-conflict files before the real merge:

    README.md
    apps/server/package.json
    apps/server/src/codexAppServerManager.test.ts
    apps/server/src/git/Layers/GitCore.ts
    apps/server/src/orchestration/Layers/ProviderCommandReactor.test.ts
    apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts
    apps/server/src/provider/Layers/ProviderService.ts
    apps/server/src/serverLayers.ts
    apps/web/src/components/ChatView.browser.tsx
    apps/web/src/components/ChatView.tsx
    apps/web/src/components/ComposerPromptEditor.tsx
    apps/web/src/components/Sidebar.logic.test.ts
    apps/web/src/components/Sidebar.tsx
    apps/web/src/composerDraftStore.ts
    apps/web/src/routes/__root.tsx
    apps/web/vite.config.ts
    package.json
    packages/contracts/src/orchestration.test.ts
    packages/contracts/src/ws.ts
    scripts/dev-runner.test.ts
    scripts/dev-runner.ts
    turbo.json

## Interfaces and Dependencies

The merged result must still expose the local `projects.readFile` RPC in `packages/contracts/src/ws.ts`, `packages/contracts/src/ipc.ts`, `apps/web/src/wsNativeApi.ts`, and `apps/server/src/wsServer.ts`. The merged orchestration schema must still include local `ProjectScript.steps` and the PR `#5` provider/context-window additions. In the web layer, `useComposerDraftStore` must keep queued-message actions, and `ChatView` must continue to call the shared `buildProjectScriptLaunchPlan` helper when running project actions. In the tooling layer, `scripts/dev-runner.ts`, `apps/web/vite.config.ts`, and `turbo.json` must expose `TETHER_*` environment variables as the canonical public interface.
