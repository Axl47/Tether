# Recover `pr-7-conflict-test` Onto `main` With Original History When Possible

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository includes `.docs/PLANS.md`. This document must be maintained in accordance with `.docs/PLANS.md`.

## Purpose / Big Picture

After this work, there will be a clean repair branch based on the current local `main` instead of the synthetic snapshot branch `pr-7-conflict-test`. The repaired branch must preserve the intended behavior from the snapshot, fix the known queued-message composer regression, and validate cleanly with the repository checks and focused high-signal test suites.

The user-visible proof is concrete. A contributor should be able to inspect the repaired branch history and see a small logical commit series instead of one synthetic catch-all commit, then run the required validation commands and the focused server, contracts, and web tests and get a clean result. The known web regression in the queued-message composer flow must be gone.

## Progress

- [x] (2026-03-20 19:15Z) Confirmed the current local state: `pr-7-conflict-test` is a synthetic snapshot rooted at `8580421` and current local `main` already contains the structured upstream and PR `#5` merge history.
- [x] (2026-03-20 19:15Z) Verified the current health baseline: root `bun -b lint` and `bun typecheck` pass, targeted server and contracts suites pass, and the focused web suite fails in `apps/web/src/composerDraftStore.test.ts`.
- [x] (2026-03-20 19:15Z) Chose current local `main` as the canonical repair base and selected “preserve original history if possible, otherwise replay logical commits” as the repair strategy.
- [x] (2026-03-20 19:17Z) Created safety refs `safety/main-before-pr7-repair` at `50e76c5` and `safety/pr-7-conflict-test-snapshot` at `60f985d`, then created the repair branch `codex/pr-7-conflict-test-repaired` from local `main`.
- [ ] Search for recoverable original commits in local reflogs and dangling objects and preserve any useful evidence.
- [ ] Replay the intended branch delta from the snapshot branch onto the repair branch as a small logical series.
- [ ] Fix the queued-message composer regression during replay so drafts normalize `terminalContexts` safely.
- [ ] Run `bun fmt`, `bun -b lint`, `bun typecheck`, and the focused server/contracts/web test suites on the repaired branch.
- [ ] Run browser chat coverage if the replay touches browser-only chat behavior.
- [ ] Record the final branch state, remaining exact-history limitations, and the publish guidance for the user.

## Surprises & Discoveries

- Observation: the synthetic snapshot branch is not only “wrong history”; it also carries a real web regression in queued-message draft loading.
  Evidence: `apps/web` focused tests fail with `TypeError: Cannot read properties of undefined (reading 'length')` inside `composerDraftStore.ts` when `loadQueuedMessageIntoComposer` persists a draft missing `terminalContexts`.

- Observation: targeted server and contracts validation already passes in the snapshot state, so the highest-risk active breakage is concentrated in the web composer draft path rather than the server/orchestration stack.
  Evidence: `apps/server` focused suites passed (`123` tests, `1` skipped), and `packages/contracts` focused suites passed (`26` tests).

- Observation: local dangling commits and stashes exist, but the synthetic snapshot branch is still the only local ref containing commit `60f985d`.
  Evidence: `git branch --all --contains 60f985d` returned only `pr-7-conflict-test` and `origin/pr-7-conflict-test`; `git fsck --full` exposed dangling commits, but they are stash/WIP artifacts rather than the missing cloud stack.

## Decision Log

- Decision: keep `main` immutable and perform all repair work on a fresh branch instead of rewriting `pr-7-conflict-test`.
  Rationale: the snapshot branch must remain available as an audit trail and fallback reference while the repaired branch is assembled and verified.
  Date/Author: 2026-03-20 / Codex

- Decision: treat exact cloud-history preservation as best-effort only and continue with a clean replay when the local checkout cannot prove the original cloud commit stack exists.
  Rationale: the user asked to implement the recovery now; waiting for an external cloud export would block a local fix even though the intended tree delta is already available in the snapshot branch.
  Date/Author: 2026-03-20 / Codex

- Decision: carry the queued-message composer fix as part of the repair rather than as a separate follow-up.
  Rationale: the repaired branch should be both history-corrected and functionally trustworthy; leaving the known regression in place would defeat the purpose of the repair.
  Date/Author: 2026-03-20 / Codex

## Outcomes & Retrospective

Pending implementation.

## Context and Orientation

The repository root is `/Users/axel/Desktop/Code_Projects/Personal/Tether`. The current snapshot branch is `pr-7-conflict-test`, whose tip is commit `60f985d`. That commit was created on March 20, 2026 and squashes a large delta onto parent `8580421`, which is the tip of `codex/merge-upstream-pingdotgg-main-v2`. Current local `main` has advanced well beyond that base and already includes the structured upstream sync and PR `#5` integration history that the snapshot branch lacks.

The repair branch created for this work is `codex/pr-7-conflict-test-repaired`, currently based on `main` at `50e76c5`. The frozen safety refs are `safety/main-before-pr7-repair` and `safety/pr-7-conflict-test-snapshot`.

The important comparison surfaces are:

`apps/web/src/composerDraftStore.ts` and `apps/web/src/composerDraftStore.test.ts`, which contain the known regression and its direct coverage.

`apps/server/src/` and `packages/contracts/src/`, where the focused runtime, websocket, and orchestration validation already passes and must remain green after replay.

`working_list.md` and this ExecPlan, which must be kept current as the repair proceeds so a future contributor can recover the context without relying on conversation history.

In this plan, a “repair branch” means a new branch created from the current local `main` that receives the intended `pr-7-conflict-test` behavior through deliberate replay rather than history rewriting. A “synthetic snapshot” means the current one-commit branch whose tree contains many changes but whose commit graph does not represent the original integration history.

## Plan of Work

First, protect the current state. Create local safety refs for both `main` and `pr-7-conflict-test`. These refs must not move during the repair. Then create a new branch from `main` that will become the repaired branch.

Second, make a final local pass for recoverable original history. Inspect reflogs, stash commits, and dangling commits. If a locally recoverable commit chain is found, preserve it under a named ref before continuing. If no such chain exists, document that exact history is unavailable locally and continue with logical replay.

Third, replay the snapshot branch onto the repair branch in logical slices rather than one giant commit. Use the current snapshot branch as the source of file content, but do not assume every file should simply overwrite `main`. Compare each slice against `main`, restore the intended snapshot version for the relevant paths, then resolve any places where `main` has newer intentional behavior that should remain. The default commit grouping is tooling/docs/CI, server/orchestration/runtime, web chat/composer/sidebar, and desktop/shell sync.

Fourth, fix the queued-message composer regression directly in `apps/web/src/composerDraftStore.ts`. The persisted draft path must normalize missing `terminalContexts` to an empty array before any `.length` access or mapping. Keep this as a compatibility fix only; do not change the outward draft contract.

Finally, run the repository checks and the focused suites on the repaired branch. If the replayed web changes affect browser-only chat behavior, run the browser suite as well. Record the exact branch produced, what validation passed, and whether any part of the original cloud history still requires an external bundle to recover exactly.

## Concrete Steps

Run all commands from `/Users/axel/Desktop/Code_Projects/Personal/Tether` unless a package path is specified.

Protect the current state and create the repair branch:

    rtk git branch safety/main-before-pr7-repair main
    rtk git branch safety/pr-7-conflict-test-snapshot pr-7-conflict-test
    rtk git checkout -b codex/pr-7-conflict-test-repaired main

Inspect whether any local commit chain is recoverable:

    rtk proxy git reflog --all --date=iso
    rtk proxy git fsck --full --no-progress
    rtk proxy git log --graph --oneline --decorate --all

Replay and validate incrementally. The exact path groups will be updated in this plan as implementation proceeds. After each logical slice, verify the branch shape and run the most relevant focused tests before moving on.

Required final validation:

    rtk proxy env PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun fmt
    rtk proxy env PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun -b lint
    rtk proxy env PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun typecheck

    cd apps/server
    rtk proxy env PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun run test src/codexAppServerManager.test.ts src/orchestration/Layers/ProviderCommandReactor.test.ts src/orchestration/Layers/ProviderRuntimeIngestion.test.ts src/wsServer.test.ts src/provider/Layers/ProviderAdapterRegistry.test.ts

    cd /Users/axel/Desktop/Code_Projects/Personal/Tether/packages/contracts
    rtk proxy env PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun run test src/orchestration.test.ts src/ws.test.ts

    cd /Users/axel/Desktop/Code_Projects/Personal/Tether/apps/web
    rtk proxy env PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun run test src/composerDraftStore.test.ts src/components/Sidebar.logic.test.ts src/wsNativeApi.test.ts

Run browser coverage if the replay changes browser-only chat code:

    cd /Users/axel/Desktop/Code_Projects/Personal/Tether/apps/web
    rtk proxy env PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun run test:browser src/components/ChatView.browser.tsx

## Validation and Acceptance

Acceptance requires a repaired branch created from current local `main`, a preserved frozen copy of the snapshot branch, and a small logical commit series instead of one synthetic catch-all commit. The repaired branch must pass root `bun fmt`, `bun -b lint`, and `bun typecheck`, plus the focused server, contracts, and web test suites listed above.

The queued-message composer regression is part of acceptance. Loading a queued message into the composer must no longer throw when the persisted draft lacks `terminalContexts`, and `apps/web/src/composerDraftStore.test.ts` must pass.

If browser-only chat files were replayed, acceptance also requires the targeted browser suite to pass.

## Idempotence and Recovery

The safety-ref creation commands are idempotent only if the branch names are unused; if they already exist, inspect them before reusing or create timestamped variants instead. All replay work happens on a fresh repair branch, so the recovery path is to discard that branch and recreate it from `main` while keeping `pr-7-conflict-test` and the safety refs untouched.

When copying files from the snapshot branch, do not reset `main` or the snapshot branch. If a logical slice proves incorrect, restore only the affected paths from `HEAD` on the repair branch and replay that slice again.

## Artifacts and Notes

Current known failing signal before the repair:

    FAIL  src/composerDraftStore.test.ts > composerDraftStore queued messages > loads a queued message into the composer and swaps existing sendable content back into place
    TypeError: Cannot read properties of undefined (reading 'length')
    at Object.partialize src/composerDraftStore.ts:1970:38

Current known healthy signals before the repair:

    apps/server focused suites: 5 passed, 122 tests passed, 1 skipped
    packages/contracts focused suites: 2 passed, 26 tests passed
    root bun typecheck: passed

## Interfaces and Dependencies

This repair uses Git branch refs as the safety mechanism and relies on the existing Bun, Vitest, and Turbo toolchain already checked into the repository. The repaired branch must preserve the current provider/runtime contracts in `packages/contracts/src/`, the current websocket/server behavior in `apps/server/src/`, and the current queued-message and composer draft interfaces in `apps/web/src/` while fixing only the missing-array compatibility bug.

Revision note: Created on 2026-03-20 to drive the repair of `pr-7-conflict-test` from current local `main`, preserve the snapshot branch as a frozen reference, and fold the queued-message composer fix into the recovery work.

Revision note: Updated on 2026-03-20 after creating the safety refs and the repair branch so the remaining work can proceed without mutating the snapshot branch.
