# Merge Pingdotgg Main Into Tether Main

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository includes `.docs/PLANS.md`. This document must be maintained in accordance with `.docs/PLANS.md`.

## Purpose / Big Picture

After this work, the Tether repository will contain the newer upstream `pingdotgg/t3code` `main` changes together with the local Tether-specific changes already on this repository's `main`. The immediate user-visible goal is that a fresh integration branch can merge cleanly, keep the `Tether` branding transition intact, and pass the repository's required validation commands so it is safe to fast-forward or merge back into `main`.

The proof is concrete. On branch `codex/merge-upstream-pingdotgg-main`, `git status` should show a clean working tree after the merge, the merged code should no longer contain unresolved conflict markers, and both required commands, `PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun -b lint` and `PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun typecheck`, should succeed from the repository root.

## Progress

- [x] (2026-03-09 18:48Z) Read `.docs/PLANS.md`, the `task-orchestrator` skill, local branch state, and the upstream branch state to establish the integration approach.
- [x] (2026-03-09 18:48Z) Fetch `https://github.com/pingdotgg/t3code.git` into `refs/remotes/upstream-pingdotgg/main` and confirm divergence from local `main`.
- [x] (2026-03-09 18:48Z) Create integration branch `codex/merge-upstream-pingdotgg-main` from local `main`.
- [x] (2026-03-09 18:48Z) Decide not to use `pr-1` as the merge base because it is effectively an older partial replica of upstream work plus branch-local merge history.
- [x] (2026-03-09 19:06Z) Merge `refs/remotes/upstream-pingdotgg/main` into `codex/merge-upstream-pingdotgg-main` and document the exact conflicts.
- [x] (2026-03-09 19:18Z) Resolve code conflicts, preferring upstream protocol/runtime fixes while preserving the local `Tether` rename and confirmed local UX additions.
- [x] (2026-03-09 19:19Z) Run `PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun -b lint` and capture the result.
- [x] (2026-03-09 19:19Z) Run `PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun typecheck` and capture the result.

## Surprises & Discoveries

- Observation: `git fetch https://github.com/pingdotgg/t3code.git main` updated `FETCH_HEAD` unexpectedly to the local origin branch context rather than serving as a stable comparison target.
  Evidence: `.git/FETCH_HEAD` showed `branch 'main' of https://github.com/Axl47/Tether`, while `git ls-remote https://github.com/pingdotgg/t3code.git refs/heads/main` returned `24122b17629451e4614d34f3b771769e87b99d79`.

- Observation: `pr-1` is not a reliable integration source because its non-merge work is already present upstream.
  Evidence: independent inspection reported `pr-1` as 17 commits ahead of local `main`, but those non-merge commits are already contained in upstream and `git diff --check` on `pr-1` is clean.

- Observation: upstream had removed the Codex `serviceTier` path from the shared contracts, but local queued-turn and ChatView merge resolutions still referenced it in a few places.
  Evidence: `bun typecheck` failed in `apps/web/src/components/QueuedTurnDispatcher.tsx`, `apps/web/src/queuedTurns.ts`, and `apps/web/src/components/ChatView.tsx` until those stale references were replaced with the newer `modelOptions` and `providerOptions` payload shapes.

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

## Outcomes & Retrospective

The integration branch now contains the upstream `pingdotgg/t3code` `main` changes merged into local Tether `main`, with the conflict set resolved in favor of current upstream contracts and runtime behavior while preserving the local `Tether` rename and local sorting/queued-follow-up UX. The highest-risk conflict surfaces were `apps/web/src/components/ChatView.tsx`, `apps/web/src/components/Sidebar.tsx`, `apps/web/src/queuedTurns.ts`, `apps/web/src/components/QueuedTurnDispatcher.tsx`, `apps/server/src/orchestration/Layers/ProviderCommandReactor.ts`, and `apps/desktop/src/main.ts`.

Validation completed successfully. `PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun -b lint` exited successfully with one pre-existing upstream warning in `apps/server/src/provider/Layers/ProviderService.ts`, and `PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun typecheck` exited successfully across the workspace.

## Context and Orientation

The local repository is `/Users/axel/Desktop/Code_Projects/Personal/Tether`. The local default branch is `main`, which currently matches `origin/main` at commit `6b58c317dd1ac099825f32606bef3cfb11a4dd53`. Upstream `pingdotgg/t3code` `main` has been fetched into `refs/remotes/upstream-pingdotgg/main` at commit `24122b17629451e4614d34f3b771769e87b99d79`. The merge base between the two histories is commit `c97c6b7836ce888b24a157de8eb4aea761028979`.

There are local-only commits on `main` that include the Tether rename and recent conversation UI work, and there are newer upstream-only commits that update contracts, sidebar behavior, plan UI, desktop behavior, release tooling, and other runtime surfaces. Based on inspection, `pr-1` should not be used as the base for this work because it mostly duplicates upstreamed changes and would add unnecessary merge history.

The highest-risk conflict areas are shared protocol and contract files in `packages/contracts/src`, provider and orchestration files in `apps/server/src`, and thread/sidebar UI files in `apps/web/src/components`. Those files are likely to require semantic conflict resolution rather than mechanical line selection because both local and upstream histories changed the same conceptual behavior.

## Plan of Work

First, perform a real merge of `refs/remotes/upstream-pingdotgg/main` into the current branch `codex/merge-upstream-pingdotgg-main` using a non-fast-forward merge. Let Git surface the actual conflicts. Record the conflict set in this plan and in `working_list.md`.

Next, resolve conflicts file by file. For naming and branding conflicts, keep the local `Tether` rename unless a specific upstream reference must remain unchanged for compatibility, such as a third-party protocol field or an external repository name. For behavioral conflicts, prefer upstream fixes in platform/runtime code when they solve concrete bugs, then reapply local functionality if upstream does not already contain an equivalent implementation.

After the tree is conflict-free, search for leftover conflict markers and stale `T3Code`-style identifiers. Review any remaining matches manually rather than blindly replacing all text, because some historical references or external links may still need the original upstream repository name.

Finally, run the required repository validation commands exactly as documented in `AGENTS.md`: `PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun -b lint` and `PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun typecheck`. If either fails, fix the failures before considering the merge branch complete.

## Concrete Steps

Run all commands from `/Users/axel/Desktop/Code_Projects/Personal/Tether`.

Create and use the integration branch:

    git checkout -b codex/merge-upstream-pingdotgg-main

Fetch upstream into a stable ref:

    git fetch -v https://github.com/pingdotgg/t3code.git refs/heads/main:refs/remotes/upstream-pingdotgg/main

Inspect divergence:

    git log --oneline --left-right --graph main...refs/remotes/upstream-pingdotgg/main
    git diff --stat --find-renames main...refs/remotes/upstream-pingdotgg/main

Perform the merge:

    git merge --no-ff refs/remotes/upstream-pingdotgg/main

If conflicts occur, inspect and resolve them, then verify the tree is clean:

    git status --short
    git diff --check
    git grep -n '<<<<<<<\\|=======\\|>>>>>>>'

Run required validation:

    PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun -b lint
    PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun typecheck

Expected successful output is a clean `git status`, no conflict markers, and successful Bun lint and typecheck runs.

## Validation and Acceptance

Acceptance requires a conflict-free merge commit on `codex/merge-upstream-pingdotgg-main`, a clean working tree afterward, and passing `PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun -b lint` and `PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun typecheck`.

Manual spot checks should confirm that Tether branding remains intact in local-facing UI and documentation, and that recent local features on `main`, especially the queued follow-up and sidebar/project updates, still exist in the merged files where intended.

## Idempotence and Recovery

The fetch and inspection steps are safe to repeat. If the merge becomes unsalvageable, the safe recovery path is to discard the integration branch and recreate it from local `main`, because all work is isolated to `codex/merge-upstream-pingdotgg-main`. During conflict resolution, avoid destructive resets on shared branches. If a specific file resolution proves incorrect, restore only that file from the merge stages or from one side of the merge and retry.

## Artifacts and Notes

Current divergence snapshot:

    Local main: 6b58c317dd1ac099825f32606bef3cfb11a4dd53
    Upstream main: 24122b17629451e4614d34f3b771769e87b99d79
    Merge base: c97c6b7836ce888b24a157de8eb4aea761028979

Representative local-only commits:

    92439bd Changed most branding
    634f3d3 Respect available editors when opening files from terminal links
    6811f8b Add collapsible plan panel summary in ChatView
    ef00e8a feat(queue): Follow ups are now queued, with a steer option available
    6b58c31 Enable drag reordering for queued follow-up messages

Representative upstream-only commits:

    42234b8 fix: plan mode ui overhaul (#596)
    8282b11 refactor(contracts): remove unused OrchestrationPersistedEvent schema (#601)
    18b6590 feat(desktop): add spellcheck suggestions to context menu (#500)
    9fdb45b Remove service tier setting from Codex flow and contracts
    24122b1 Stabilize toast stacking offsets to prevent hover flicker

## Interfaces and Dependencies

This merge touches multiple packages that share TypeScript contracts. `packages/contracts` is schema-only and must remain free of runtime helpers. `apps/server` depends on those contracts for WebSocket and provider orchestration behavior. `apps/web` consumes the projected orchestration events and must stay in sync with any contract changes introduced by the merge. `bun.lock` and the package manifests in `apps/server`, `apps/web`, and `packages/contracts` must remain consistent with the merged dependency graph.

Revision note: Created on 2026-03-09 to guide the upstream merge of `pingdotgg/t3code` `main` into local Tether `main` on branch `codex/merge-upstream-pingdotgg-main`.
