# Merge Pingdotgg Main PR 3 Into Tether Main

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository includes `.docs/PLANS.md`. This document must be maintained in accordance with `.docs/PLANS.md`.

## Purpose / Big Picture

After this work, the Tether repository will contain the newer upstream `pingdotgg/t3code` `main` changes now represented by GitHub PR `#3`, together with the local Tether-specific changes already on this repository's `main`. The immediate user-visible goal is that a fresh integration branch can merge cleanly, keep the `Tether` branding transition intact, preserve the local sidebar, queued-follow-up, and project-action improvements added after the March merge, and pass the repository's required validation commands so it is safe to merge back into `main`.

The proof is concrete. On branch `codex/merge-upstream-pingdotgg-main-v2`, `git status` should show a clean working tree after the merge, the merged code should no longer contain unresolved conflict markers, the known local UX changes should still work, and both required commands, `PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun -b lint` and `PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun typecheck`, should succeed from the repository root.

## Progress

- [x] (2026-03-09 18:48Z) Read `.docs/PLANS.md`, the `task-orchestrator` skill, local branch state, and the upstream branch state to establish the first integration approach.
- [x] (2026-03-09 18:48Z) Fetch `https://github.com/pingdotgg/t3code.git` into `refs/remotes/upstream-pingdotgg/main` and confirm divergence from local `main`.
- [x] (2026-03-09 18:48Z) Create integration branch `codex/merge-upstream-pingdotgg-main` from local `main`.
- [x] (2026-03-09 18:48Z) Decide not to use `pr-1` as the merge base because it is effectively an older partial replica of upstream work plus branch-local merge history.
- [x] (2026-03-09 19:06Z) Merge `refs/remotes/upstream-pingdotgg/main` into `codex/merge-upstream-pingdotgg-main` and document the exact conflicts.
- [x] (2026-03-09 19:18Z) Resolve code conflicts, preferring upstream protocol/runtime fixes while preserving the local `Tether` rename and confirmed local UX additions.
- [x] (2026-03-09 19:19Z) Run `PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun -b lint` and capture the result.
- [x] (2026-03-09 19:19Z) Run `PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun typecheck` and capture the result.
- [x] (2026-03-11 23:36Z) Refresh upstream refs and confirm that `upstream-pingdotgg/main` has advanced to `ff6a66dcabfcfcf28c8c8feb126a7b90842d6368` while GitHub PR `#3` points at the same upstream change line.
- [x] (2026-03-11 23:36Z) Create a fresh integration branch `codex/merge-upstream-pingdotgg-main-v2` from current local `main` at `477b04efa2cf2d4e38daf90b4ebbf6af0a789f53`.
- [ ] Merge `refs/remotes/upstream-pingdotgg/main` at `ff6a66dcabfcfcf28c8c8feb126a7b90842d6368` into `codex/merge-upstream-pingdotgg-main-v2` and record the actual conflict set.
- [ ] Resolve semantic overlap in sidebar/status, ChatView/project-actions, and server/contracts/branding while preserving the local Tether changes added after the March merge.
- [ ] Run targeted overlap tests plus `PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun -b lint` and `PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun typecheck`.

## Surprises & Discoveries

- Observation: `git fetch https://github.com/pingdotgg/t3code.git main` updated `FETCH_HEAD` unexpectedly to the local origin branch context rather than serving as a stable comparison target.
  Evidence: `.git/FETCH_HEAD` showed `branch 'main' of https://github.com/Axl47/Tether`, while `git ls-remote https://github.com/pingdotgg/t3code.git refs/heads/main` returned `24122b17629451e4614d34f3b771769e87b99d79`.

- Observation: `pr-1` is not a reliable integration source because its non-merge work is already present upstream.
  Evidence: independent inspection reported `pr-1` as 17 commits ahead of local `main`, but those non-merge commits are already contained in upstream and `git diff --check` on `pr-1` is clean.

- Observation: upstream had removed the Codex `serviceTier` path from the shared contracts, but local queued-turn and ChatView merge resolutions still referenced it in a few places.
  Evidence: `bun typecheck` failed in `apps/web/src/components/QueuedTurnDispatcher.tsx`, `apps/web/src/queuedTurns.ts`, and `apps/web/src/components/ChatView.tsx` until those stale references were replaced with the newer `modelOptions` and `providerOptions` payload shapes.

- Observation: GitHub PR `#3` is not a divergent patch stack; it points at the same upstream line now exposed by `refs/remotes/upstream-pingdotgg/main`.
  Evidence: `git ls-remote https://github.com/Axl47/Tether.git refs/pull/3/head` returned `ff6a66dcabfcfcf28c8c8feb126a7b90842d6368`, matching `git rev-parse upstream-pingdotgg/main` after the refresh.

- Observation: the current overlap is broader than the March merge, but `git merge-tree` against the fresh refs showed semantic overlap without raw conflict markers before the real merge was attempted.
  Evidence: the simulated merge reported many files changed on both sides across `apps/server`, `apps/web`, `packages/contracts`, and desktop/release surfaces, while `rg` against the merge-tree output found no `<<<<<<<`, `=======`, or `>>>>>>>` sections.

## Decision Log

- Decision: Perform the integration from local `main` on a new branch named `codex/merge-upstream-pingdotgg-main`.
  Rationale: the user explicitly said `pr-1` could be abandoned, the worktree was clean, and integrating from `main` minimizes inherited branch-local merge noise.
  Date/Author: 2026-03-09 / Codex

- Decision: Fetch upstream into `refs/remotes/upstream-pingdotgg/main` rather than relying on `FETCH_HEAD`.
  Rationale: a named remote-tracking ref makes the comparison and merge target stable, auditable, and repeatable.
  Date/Author: 2026-03-09 / Codex

- Decision: Preserve the `Tether` rename while merging upstream.
  Rationale: the user stated that all `T3Code` mentions and derivatives should now be `Tether`, so merge resolutions must treat lingering upstream `T3Code` naming as stale unless there is a deliberate exception backed by runtime behavior.
  Date/Author: 2026-03-09 / Codex

- Decision: keep the upstream shared sidebar status helper, but extend it to treat queued-turn dispatch as `Working`.
  Rationale: this preserves the local queued follow-up UX without keeping the older duplicated inline status logic inside `Sidebar.tsx`.
  Date/Author: 2026-03-09 / Codex

- Decision: perform the new sync on a fresh branch named `codex/merge-upstream-pingdotgg-main-v2` instead of reusing the March merge branch.
  Rationale: local `main` now contains additional post-March work, including sidebar status/color changes, plan header changes, and multi-terminal project actions, so starting from current `main` minimizes replay work and makes the merge target match the branch users actually want.
  Date/Author: 2026-03-11 / Codex

- Decision: treat `refs/remotes/upstream-pingdotgg/main` at `ff6a66dcabfcfcf28c8c8feb126a7b90842d6368` as the source of truth for PR `#3`.
  Rationale: PR `#3` currently points to the same upstream head, so using the stable remote-tracking ref keeps the merge reproducible while still honoring the user's PR reference.
  Date/Author: 2026-03-11 / Codex

- Decision: aggressively rename newly introduced repo-owned `T3Code` and `@t3tools` identifiers within touched files while preserving compatibility-sensitive third-party or protocol-owned names.
  Rationale: the user explicitly requested that all T3Code-derived naming transition to Tether, and the new upstream sync introduces fresh repo-owned naming surfaces that should not be allowed to regress that transition.
  Date/Author: 2026-03-11 / Codex

## Outcomes & Retrospective

The March integration branch is still available as a reference and remains valuable for prior resolution choices, but it is no longer the full desired result because local `main` has advanced and upstream `main` has also moved forward again. The new work on `codex/merge-upstream-pingdotgg-main-v2` must preserve the post-March local changes, adopt the new upstream runtime/sidebar/diff updates, and aggressively continue the Tether naming transition on touched files.

Validation for the new sync is still pending. Success requires a clean merge on `codex/merge-upstream-pingdotgg-main-v2`, conflict-marker checks, targeted overlap tests, and passing `PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun -b lint` and `PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun typecheck`.

## Context and Orientation

The local repository is `/Users/axel/Desktop/Code_Projects/Personal/Tether`. The local default branch is `main`, which currently matches `origin/main` at commit `477b04efa2cf2d4e38daf90b4ebbf6af0a789f53`. Upstream `pingdotgg/t3code` `main` has been refreshed into `refs/remotes/upstream-pingdotgg/main` at commit `ff6a66dcabfcfcf28c8c8feb126a7b90842d6368`. GitHub PR `#3` in the local repository points at the same upstream line, so it is an alternate label for this integration rather than a different code stream. The current merge base between local `main` and refreshed upstream `main` is still commit `24122b17629451e4614d34f3b771769e87b99d79`.

There are local-only commits on `main` after that merge base that include the orange awaiting-input sidebar indicator, the plan-toggle move into header actions, the multi-terminal project-action execution work, README/branding updates, and the earlier queued-follow-up features already merged through the previous integration branch. There are newer upstream-only commits after that same base that update runtime orchestration and WebSocket behavior, persist diff panel state across thread navigation, modify sidebar status sourcing, and adjust release/build metadata.

The highest-risk overlap areas are shared protocol and contract files in `packages/contracts/src`, provider and orchestration files in `apps/server/src`, and thread/sidebar UI files in `apps/web/src/components`. Those files are likely to require semantic reconciliation rather than mechanical line selection because both local and upstream histories changed the same conceptual behavior, even where Git may auto-merge the text.

## Plan of Work

First, perform a real merge of `refs/remotes/upstream-pingdotgg/main` into the current branch `codex/merge-upstream-pingdotgg-main-v2` using a non-fast-forward merge. Let Git surface the actual conflicts. Record the conflict set in this plan and in `working_list.md`.

Next, resolve the merge in three semantic passes. In the sidebar/status pass, keep upstream live activity sourcing but reapply local Tether status semantics so awaiting-input remains orange and previous sidebar UX fixes are preserved. In the Chat/project-actions pass, keep upstream thread navigation and runtime safety fixes, then reapply the local plan-toggle placement, queued-follow-up behavior, drag reordering, and the multi-terminal project-action system. In the server/contracts/branding pass, keep upstream runtime and WebSocket refactors, then fold the local `ProjectScript.steps` and bounded `projects.readFile` RPC additions back into the merged contracts, web client, and server router while aggressively renaming newly touched repo-owned T3Code/T3tools identifiers.

After the tree is conflict-free, search for leftover conflict markers and stale repo-owned `T3Code`-style identifiers in touched files. Review remaining matches manually rather than blindly replacing all text, because some references may intentionally target the upstream repository, external artifacts, or third-party protocol fields.

Finally, run targeted suites for the overlap areas, then run the required repository validation commands exactly as documented in `AGENTS.md`: `PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun -b lint` and `PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun typecheck`. If any check fails, fix the failures before considering the merge branch complete.

## Concrete Steps

Run all commands from `/Users/axel/Desktop/Code_Projects/Personal/Tether`.

Create and use the integration branch:

    rtk git checkout -b codex/merge-upstream-pingdotgg-main-v2

Fetch upstream into a stable ref:

    rtk git fetch -v https://github.com/pingdotgg/t3code.git refs/heads/main:refs/remotes/upstream-pingdotgg/main
    rtk git fetch -v https://github.com/pingdotgg/t3code.git refs/pull/3/head:refs/remotes/upstream-pingdotgg/pr-3

Inspect divergence:

    rtk git log --oneline --left-right --graph main...refs/remotes/upstream-pingdotgg/main
    rtk git diff --stat --find-renames main...refs/remotes/upstream-pingdotgg/main

Perform the merge:

    rtk git merge --no-ff refs/remotes/upstream-pingdotgg/main

If conflicts occur, inspect and resolve them, then verify the tree is clean:

    rtk git status --short
    rtk git diff --check
    rtk proxy bash -lc 'git grep -n "<<<<<<<\\|=======\\|>>>>>>>" || true'

Run the high-risk targeted suites after resolving the overlap:

    rtk proxy env PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun run test apps/web/src/components/Sidebar.logic.test.ts
    rtk proxy env PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun run test:browser apps/web/src/components/ChatView.browser.tsx
    rtk proxy env PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun run test apps/web/src/projectScripts.test.ts apps/web/src/wsNativeApi.test.ts
    rtk proxy env PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun run test apps/server/src/wsServer.test.ts

Run required validation:

    rtk proxy env PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun -b lint
    rtk proxy env PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun typecheck

Expected successful output is a clean `git status`, no conflict markers, and successful Bun lint and typecheck runs.

## Validation and Acceptance

Acceptance requires a conflict-free merge commit on `codex/merge-upstream-pingdotgg-main-v2`, a clean working tree afterward, no unresolved conflict markers, passing the targeted overlap suites, and passing `PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun -b lint` and `PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun typecheck`.

Manual spot checks should confirm that Tether branding remains intact in local-facing UI and documentation, the sidebar pills use live thread activity while still rendering awaiting-input in orange, queued follow-ups can queue and steer without losing the working state, the plan toggle still lives in header actions, diff panel state survives thread navigation, and multi-terminal project actions still open the expected terminals.

## Idempotence and Recovery

The fetch and inspection steps are safe to repeat. If the merge becomes unsalvageable, the safe recovery path is to discard the integration branch and recreate it from local `main`, because all work is isolated to `codex/merge-upstream-pingdotgg-main-v2`. During conflict resolution, avoid destructive resets on shared branches. If a specific file resolution proves incorrect, restore only that file from the merge stages or from one side of the merge and retry.

## Artifacts and Notes

Current divergence snapshot:

    Local main: 477b04efa2cf2d4e38daf90b4ebbf6af0a789f53
    Upstream main: ff6a66dcabfcfcf28c8c8feb126a7b90842d6368
    PR 3 ref: 94420192359d68c03241f03f47cf8d670abafa15
    Merge base: 24122b17629451e4614d34f3b771769e87b99d79

Representative local-only commits:

    8ba8625 fix(sidebar): use orange for awaiting-input thread indicator
    8cf3d34 fix(chat): move plan sidebar toggle into header actions
    a73ef12 feat(project-actions): add first-class multi-terminal action execution
    477b04e fix(project-actions): match wrapped react-native android commands

Representative upstream-only commits:

    7d11533 Stabilize runtime orchestration and fix flaky CI tests (#488)
    7ddcb23 feat: persist diff panel state across thread navigation (#875)
    e8b0126 fix: checkpoint diffs never resolve (shared PubSub subscription) (#595)
    2ac7356 chore(release): align package versions before building artifacts (#933)
    ff6a66d Use live thread activities for sidebar status pills (#919)

## Interfaces and Dependencies

This merge touches multiple packages that share TypeScript contracts. `packages/contracts` is schema-only and must remain free of runtime helpers. `apps/server` depends on those contracts for WebSocket and provider orchestration behavior. `apps/web` consumes the projected orchestration events and must stay in sync with any contract changes introduced by the merge. `bun.lock` and the package manifests in `apps/server`, `apps/web`, `packages/contracts`, and any touched desktop or script package manifests must remain consistent with the merged dependency graph. The merged result must still expose the local `ProjectScript.steps` schema and bounded `projects.readFile` RPC, because the current Tether web UI depends on them for multi-terminal project actions.

Revision note: Updated on 2026-03-11 to refresh the plan for upstream PR `#3` / `upstream-pingdotgg/main` at `ff6a66d`, switch the work onto `codex/merge-upstream-pingdotgg-main-v2`, and record the aggressive Tether rename policy plus the newer local features that must survive this sync.
