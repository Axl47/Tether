# Integrate Current `pingdotgg/t3code` Main Into `Sync-upstream`

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository includes `.docs/PLANS.md`. This document must be maintained in accordance with `.docs/PLANS.md`.

## Purpose / Big Picture

After this work, the local `Sync-upstream` branch will contain the current upstream `pingdotgg/t3code` `main` branch together with the Tether-specific feature stack already carried locally. The result must keep Tether branding and local UX/runtime additions intact while adopting upstream's newer server, provider, desktop, RPC, release, and web architecture. A successful outcome is observable as a clean merge commit on `Sync-upstream`, a clean working tree after validation, no unresolved conflict markers, and passing `bun fmt`, `bun lint`, and `bun typecheck` from the repository root.

## Progress

- [x] (2026-04-19 19:21Z) Confirm the repository is on branch `Sync-upstream` at commit `5ade17e766601194820c324827db036ca1319cef` with a clean working tree.
- [x] (2026-04-19 19:21Z) Create recovery branch `safety/sync-upstream-before-upstream-2026-04-19` from the pre-merge tip.
- [x] (2026-04-19 19:21Z) Review `.docs/exec/upstream-main-integration.md`, the `task-orchestrator` skill, and current branch divergence to reset the merge plan on the real April 19 state.
- [ ] Fetch `https://github.com/pingdotgg/t3code` `main` into `refs/remotes/upstream-pingdotgg/main` and record the fetched commit.
- [ ] Merge `refs/remotes/upstream-pingdotgg/main` into `Sync-upstream` and record the actual conflict set.
- [ ] Resolve semantic overlap while preserving Tether-specific behavior on top of the newer upstream baseline.
- [ ] Run targeted overlap tests plus `bun fmt`, `bun lint`, and `bun typecheck`.
- [ ] Update this plan with the final conflict notes, validation evidence, and retrospective.

## Surprises & Discoveries

- Observation: GitHub's compare view and local raw commit counts agree that this is a major integration, not a tiny catch-up.
  Evidence: `git rev-list --count Sync-upstream..FETCH_HEAD` returned `275`, and `git rev-list --count FETCH_HEAD..Sync-upstream` returned `137`.

- Observation: The earlier reduced-scope assessment was incorrect because a `--cherry-pick` log sample was truncated and hid most of the divergence.
  Evidence: `git cherry FETCH_HEAD Sync-upstream | wc -l` still returned `122` local non-equivalent commits even after patch-equivalence filtering.

- Observation: Prior March merge notes are still useful, but they target `ff6a66d` and an older local baseline, so they cannot be replayed blindly.
  Evidence: the prior ExecPlan references `main` at `477b04e`, while the current work lands directly on `Sync-upstream` at `5ade17e`.

## Decision Log

- Decision: Land the integration directly on `Sync-upstream` instead of a fresh merge branch.
  Rationale: the user explicitly chose to keep `Sync-upstream` as the landing branch even after the true divergence size was clarified.
  Date/Author: 2026-04-19 / Codex

- Decision: Create a safety snapshot branch before mutating `Sync-upstream`.
  Rationale: this preserves a clean rollback point without changing the user-selected landing branch.
  Date/Author: 2026-04-19 / Codex

- Decision: Treat upstream as the structural baseline in core architecture overlaps, then reapply intended Tether-specific behavior.
  Rationale: both sides changed the same server, web, desktop, and contract surfaces; replaying the older local structure wholesale would discard meaningful upstream evolution.
  Date/Author: 2026-04-19 / Codex

- Decision: Preserve local Tether identity, repo command conventions, and confirmed Tether-only UX/features unless upstream introduces a clearly necessary functional replacement.
  Rationale: the repository is intentionally no longer a plain T3Code mirror, so merge resolutions must keep the product line and local workflow consistent.
  Date/Author: 2026-04-19 / Codex

## Outcomes & Retrospective

This section will be completed after the merge and validation finish. Success requires the fetched upstream ref to be merged into `Sync-upstream`, conflict markers eliminated, Tether-specific behavior preserved where intended, and the required repository checks to pass.

## Context and Orientation

The repository root is `/Users/axel/Desktop/Code_Projects/Personal/Tether`. The active branch is `Sync-upstream`, currently at `5ade17e766601194820c324827db036ca1319cef`. A safety branch named `safety/sync-upstream-before-upstream-2026-04-19` has already been created from that same tip. The live upstream target is `https://github.com/pingdotgg/t3code` branch `main`, whose current head was previously confirmed as `c83bc5d48a2bf983acb1c8aaff3d34f86c14032e`.

This is a long-running fork integration. Relative to the live upstream target, GitHub and local checks both report `Sync-upstream` as `137` commits ahead and `275` commits behind. Many of the local commits are Tether-specific features and ports: browser pane and split view work, queued follow-up handling and defer flow, desktop context and Pragma/local discovery integrations, multi-terminal project actions, context-window reporting changes, command palette project browsing, and Tether branding/documentation changes. Upstream has continued evolving the server runtime, provider system, desktop startup behavior, RPC and recovery flow, auth/bootstrap model, release workflows, and the web store architecture.

The highest-risk overlap areas are `apps/server`, `apps/web`, `apps/desktop`, `packages/contracts`, release/workflow files, and shared branding/docs. These areas changed significantly on both sides. Expect semantic resolution work even where Git can auto-merge the text.

## Plan of Work

First, refresh the upstream target into `refs/remotes/upstream-pingdotgg/main` so the merge input is stable and auditable. Record the fetched commit in this plan. Then perform a non-fast-forward merge of `refs/remotes/upstream-pingdotgg/main` into `Sync-upstream`. If Git reports conflicts, capture the exact file set and resolve the merge in subsystem passes rather than file order.

In the server/contracts pass, keep upstream's newer provider, auth, RPC, release, and orchestration baseline, then reintroduce still-intended Tether behavior that is missing after the merge. In the web/desktop pass, keep upstream's current architecture for state, recovery, and runtime wiring, then port over Tether-specific UX additions such as browser pane flows, split-view behavior, queued follow-ups, project actions, context-window reporting, desktop context behavior, and branding/copy changes. In docs and metadata, preserve Tether naming, local front matter additions, and the `rtk` command convention unless an upstream change is required for functionality.

After the merge text is clean, audit the repository for unresolved conflict markers, dropped Tether features, stale repo-owned `T3Code` naming, and contract mismatches across `apps/server`, `apps/web`, and `packages/contracts`. Finally, run targeted tests for the highest-overlap areas, then run the repository-required `bun fmt`, `bun lint`, and `bun typecheck` commands. Fix every failure before finalizing the merge commit.

## Concrete Steps

Run all commands from `/Users/axel/Desktop/Code_Projects/Personal/Tether`.

Fetch upstream into a stable ref:

    rtk git fetch -v https://github.com/pingdotgg/t3code refs/heads/main:refs/remotes/upstream-pingdotgg/main
    rtk git rev-parse refs/remotes/upstream-pingdotgg/main

Inspect divergence and merge:

    rtk git rev-list --count Sync-upstream..refs/remotes/upstream-pingdotgg/main
    rtk git rev-list --count refs/remotes/upstream-pingdotgg/main..Sync-upstream
    rtk git merge --no-ff refs/remotes/upstream-pingdotgg/main

If conflicts occur, inspect and resolve them, then verify the tree is clean:

    rtk git status --short
    rtk git diff --check
    rtk proxy bash -lc 'git grep -n "<<<<<<<\\|=======\\|>>>>>>>" || true'

Run targeted overlap suites after resolving the merge:

    rtk proxy env PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun run test apps/server/src/codexAppServerManager.test.ts apps/server/src/orchestration/decider.projectScripts.test.ts
    rtk proxy env PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun run test apps/server/integration/providerService.integration.test.ts apps/server/integration/orchestrationEngine.integration.test.ts
    rtk proxy env PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun run test apps/web/src/components/Sidebar.logic.test.ts apps/web/src/components/ChatView.logic.test.ts apps/web/src/projectScripts.test.ts

Run required repository validation:

    rtk proxy env PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun fmt
    rtk proxy env PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun -b lint
    rtk proxy env PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun typecheck

Create the merge commit if Git did not auto-create one:

    rtk git add -A
    rtk git commit

## Validation and Acceptance

Acceptance requires a merge commit on `Sync-upstream` that brings in the fetched upstream `main`, a clean working tree after validation, no unresolved conflict markers, passing targeted overlap suites, and successful `bun fmt`, `bun lint`, and `bun typecheck` runs from the repository root. Manual spot checks should confirm that Tether branding remains intact, the repo's `rtk`-based command guidance still appears in local docs where intended, and the Tether-specific UI/runtime behaviors called out above still exist after the upstream merge.

## Idempotence and Recovery

The fetch and inspection steps are safe to repeat. If the merge becomes unsalvageable, the recovery path is to reset the local branch pointer back to `safety/sync-upstream-before-upstream-2026-04-19` or recreate `Sync-upstream` from that saved tip, because the safety branch captures the exact pre-merge state. During conflict resolution, prefer restoring individual files from one merge side rather than using broad destructive resets.

## Artifacts and Notes

Initial state at the start of implementation:

    Active branch: Sync-upstream
    Active tip: 5ade17e766601194820c324827db036ca1319cef
    Safety branch: safety/sync-upstream-before-upstream-2026-04-19
    Live upstream tip previously confirmed: c83bc5d48a2bf983acb1c8aaff3d34f86c14032e
    Raw divergence: 137 ahead / 275 behind
    Local patch-equivalent divergence check: 122 local non-equivalent commits

Representative local behaviors to preserve when still absent after the merge:

    Browser pane and split-thread view flows
    Desktop context and Pragma/local discovery integration
    Queued follow-ups and defer flow
    Multi-terminal project actions
    Command palette project browsing
    Context-window reporting changes
    Sidebar and thread UX changes
    Tether-specific branding and docs wording

## Interfaces and Dependencies

`packages/contracts` must remain schema-only. `apps/server` depends on those contracts for provider, orchestration, RPC, and persistence behavior. `apps/web` depends on them for client runtime, WebSocket/RPC handling, and thread/session UX. `apps/desktop` must stay aligned with the merged server startup and client wiring. `bun.lock`, workspace manifests, and release/workflow files must remain internally consistent after the merge. Any contract or runtime shape changed during conflict resolution must be reconciled across all affected packages before validation is considered complete.
