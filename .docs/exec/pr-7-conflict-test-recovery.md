# Recover `pr-7-conflict-test` Onto the Authored Upstream Line

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository includes `.docs/PLANS.md`. This document must be maintained in accordance with `.docs/PLANS.md`.

## Purpose / Big Picture

After this work, there will be a clean repair branch whose ancestry includes the authored upstream commits represented by PR `#7` instead of hiding that work behind a fork-local replay on top of local `main`. The repaired branch must still preserve the intended behavior from the snapshot, keep the queued-message composer regression fixed, and validate cleanly with the repository checks and focused high-signal test suites.

The user-visible proof is concrete. A contributor should be able to inspect the repaired branch history and see the authored upstream `pingdotgg/main` chain in its ancestry, then see the fork-only and repair commits replayed on top of that line rather than GitHub reporting the branch as dozens of commits behind upstream. The required validation commands and focused tests must still pass, and the known queued-message composer regression must remain fixed.

## Progress

- [x] (2026-03-20 19:15Z) Confirmed the current local state: `pr-7-conflict-test` is a synthetic snapshot rooted at `8580421` and current local `main` already contains the structured upstream and PR `#5` merge history.
- [x] (2026-03-20 19:15Z) Verified the current health baseline: root `bun -b lint` and `bun typecheck` pass, targeted server and contracts suites pass, and the focused web suite fails in `apps/web/src/composerDraftStore.test.ts`.
- [x] (2026-03-20 19:15Z) Chose current local `main` as the canonical repair base and selected “preserve original history if possible, otherwise replay logical commits” as the repair strategy.
- [x] (2026-03-20 19:17Z) Created safety refs `safety/main-before-pr7-repair` at `50e76c5` and `safety/pr-7-conflict-test-snapshot` at `60f985d`, then created the repair branch `codex/pr-7-conflict-test-repaired` from local `main`.
- [x] (2026-03-20 19:19Z) Rechecked local reflogs, refs, and dangling commits and confirmed that the original cloud commit stack is not recoverable from this checkout alone; only the synthetic snapshot refs and unrelated WIP stash commits remain.
- [x] (2026-03-20 19:27Z) Replayed the snapshot delta onto `codex/pr-7-conflict-test-repaired` as four logical commits: tooling/workflows, desktop shell sync, server/contracts runtime changes, and web chat/composer/sidebar changes.
- [x] (2026-03-20 19:27Z) Fixed the queued-message composer regression by ensuring queued drafts always carry `terminalContexts` and by making persistence treat a missing array as empty.
- [x] (2026-03-20 19:29Z) Ran `bun fmt`, `bun -b lint`, `bun typecheck`, the focused server/contracts/web tests, and the targeted browser suite successfully on the repaired branch.
- [x] (2026-03-20 19:29Z) Recorded the final repaired branch state and the remaining exact-history limitation for later cloud import if the user wants it.
- [x] (2026-03-20 20:08Z) Confirmed the remaining authorship issue: `codex/pr-7-conflict-test-repaired` is rooted on local `main`, so Git still reports the authored upstream `pingdotgg/main` commits as missing even though equivalent content exists through different commits.
- [x] (2026-03-20 20:25Z) Attempted a full `--rebase-merges` ancestry transplant and confirmed it explodes into a 107-step replay with broad conflicts because both local `main` and upstream evolved heavily after `ff6a66d`.
- [x] (2026-03-20 20:36Z) Switched to a merge-based authorship repair, merged `refs/heads/pingdotgg/main` into the repaired branch, resolved conflicts in favor of the already-validated repaired tree, and committed merge `68c81e0`.
- [x] (2026-03-20 20:36Z) Verified the new branch ancestry is no longer behind `refs/heads/pingdotgg/main`; `git rev-list --left-right --count refs/heads/pingdotgg/main...HEAD` now returns `0 95`.
- [x] (2026-03-20 20:49Z) Moved the official branch ref `codex/pr-7-conflict-test-repaired` to merge commit `68c81e0` and reran `bun fmt`, `bun -b lint`, and `bun typecheck` successfully on that branch.
- [x] (2026-03-20 20:52Z) Pushed `codex/pr-7-conflict-test-repaired` to `origin`; the remote branch now points at `f9d199e`, which contains the upstream ancestry merge plus the recovery-notes follow-up.
- [x] (2026-03-20 21:02Z) Verified the local upstream ref was stale, fetched the real latest `pingdotgg/t3code:main` tip `ef25691`, and identified 10 newer upstream commits beyond the previously merged `fb18b2d`.
- [x] (2026-03-20 21:20Z) Recorded the newest upstream tip with merge `7740039` using the `ours` strategy so the repaired branch now descends from `ef25691` without destabilizing the fork-specific tree.
- [x] (2026-03-20 21:20Z) Reran `bun fmt`, `bun -b lint`, and `bun typecheck` successfully after the latest-upstream ancestry merge.
- [ ] (2026-03-20 21:20Z) Push the latest-upstream ancestry merge and change PR `#7` to use `codex/pr-7-conflict-test-repaired` as its base branch instead of `main`.

## Surprises & Discoveries

- Observation: the synthetic snapshot branch is not only “wrong history”; it also carries a real web regression in queued-message draft loading.
  Evidence: `apps/web` focused tests fail with `TypeError: Cannot read properties of undefined (reading 'length')` inside `composerDraftStore.ts` when `loadQueuedMessageIntoComposer` persists a draft missing `terminalContexts`.

- Observation: targeted server and contracts validation already passes in the snapshot state, so the highest-risk active breakage is concentrated in the web composer draft path rather than the server/orchestration stack.
  Evidence: `apps/server` focused suites passed (`123` tests, `1` skipped), and `packages/contracts` focused suites passed (`26` tests).

- Observation: local dangling commits and stashes exist, but the synthetic snapshot branch is still the only local ref containing commit `60f985d`.
  Evidence: `git branch --all --contains 60f985d` returned only `pr-7-conflict-test` and `origin/pr-7-conflict-test`; `git fsck --full` exposed dangling commits, but they are stash/WIP artifacts rather than the missing cloud stack.

- Observation: the replayed browser failures were expectation drift, not broad product regressions. The current UI launches project actions from the `Run actions` menu and wraps pending user-input options in a tooltip trigger.
  Evidence: the targeted browser suite failed until the tests opened the `Run actions` menu and stopped asserting the exact `data-slot` value on the option button wrapper, after which `47` browser tests passed.

- Observation: the “behind upstream” count is caused by ancestry, not content. The current repaired branch and the authored upstream line share ancestor `ff6a66d`, but local `main` contains `94` commits after that point while local `refs/heads/pingdotgg/main` contains `56` different authored upstream commits after that point.
  Evidence: `git rev-list --left-right --count refs/heads/pingdotgg/main...codex/pr-7-conflict-test-repaired` returned `56 94`.

- Observation: a full rebase onto the authored upstream line is possible in theory but impractical in practice because Git has to replay 100+ local commits and merges through dozens of feature files.
  Evidence: `git rebase --rebase-merges --onto refs/heads/pingdotgg/main ff6a66d` stopped at step `31/107` with conflicts across desktop, server, web, contracts, and shared runtime files.

- Observation: resolving the merge conflicts in favor of the already-validated repaired branch produced a merge commit with the same effective tree as the pre-merge repaired branch, so the code state stayed stable while ancestry changed.
  Evidence: after resolving conflicts and removing duplicate upstream migration files, the merge completed as `68c81e0` and the branch became a descendant of `refs/heads/pingdotgg/main` without reintroducing test failures.

- Observation: the local `pingdotgg/main` ref was not actually at the current upstream tip. The real upstream repository `pingdotgg/t3code` has advanced from `fb18b2d` to `ef25691`, adding 10 more commits after the branch repair.
  Evidence: `git ls-remote https://github.com/pingdotgg/t3code.git refs/heads/main` returned `ef2569196f164df1096ebd8c614fafa0ebc43be9`, and `git log --reverse fb18b2d..refs/heads/pingdotgg/main` listed 10 newer commits.

- Observation: the latest 10 upstream commits do not cleanly content-merge into the fork because they assume the upstream `claudeAgent`-style provider/contracts model, while this branch already carries the fork’s `claudeCode` and `gemini` integration.
  Evidence: a normal merge produced contract type errors such as `Property 'claudeAgent' does not exist` in `packages/contracts/src/provider.test.ts`; aborting that merge and redoing it with `-s ours` preserved a green branch while still recording the latest upstream ancestry.

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

- Decision: keep the current `main` header behavior for project actions and update browser tests to drive the menu-based launcher instead of restoring older direct-button expectations.
  Rationale: `main` already renders project actions through the `Run actions` menu in `ChatView`, and the goal of this repair is to preserve current behavior while restoring the snapshot functionality on top of the correct base.
  Date/Author: 2026-03-20 / Codex

- Decision: move the repaired branch a second time, from local `main` ancestry to `refs/heads/pingdotgg/main` ancestry, instead of accepting the local-`main` replay as final.
  Rationale: the user wants GitHub to show the upstream PR `#7` authorship in the branch ancestry; that can only happen if the repaired branch actually descends from the authored upstream commit line instead of the fork-local replay line.
  Date/Author: 2026-03-20 / Codex

- Decision: implement the ancestry repair as a merge commit from `refs/heads/pingdotgg/main` into the repaired branch instead of completing the full rebase attempt.
  Rationale: the merge makes the branch a descendant of the authored upstream line in one step, preserves the already-validated repaired tree, and avoids replaying 100+ commits through broad conflicts.
  Date/Author: 2026-03-20 / Codex

- Decision: record the newest upstream `ef25691` tip with an explicit `-s ours` merge instead of taking the latest upstream content changes directly.
  Rationale: the fork’s provider/contracts model has diverged from upstream enough that the newest upstream files break typecheck; the `ours` merge preserves the stable repaired tree while still making the branch descend from the real latest upstream head.
  Date/Author: 2026-03-20 / Codex

## Outcomes & Retrospective

The first repaired branch exists as `codex/pr-7-conflict-test-repaired` on top of current local `main`, with the snapshot behavior replayed across four logical commits plus a small final validation cleanup. A second ancestry-corrected branch now exists as `codex/pr-7-conflict-test-authorship`, whose tip `68c81e0` merges the authored upstream line `refs/heads/pingdotgg/main` into that repaired history.

Local exact-history recovery is still incomplete because this checkout does not contain the original cloud commit stack; only the synthetic snapshot commit and older WIP stash objects are present. The current work therefore shifts from “recover the cloud stack exactly” to “place the repaired fork changes on top of the authored upstream line that is already available locally as `refs/heads/pingdotgg/main`.”

Functionally, the local-`main` replay branch remains in a trusted state and the ancestry-corrected merge preserves that tree while changing history. The queued-message composer regression stays fixed, the prior focused server/contracts/web coverage remains applicable because the merge resolution kept the validated code state, and the required repo checks have been rerun successfully on the official repaired branch ref at `68c81e0`.

## Context and Orientation

The repository root is `/Users/axel/Desktop/Code_Projects/Personal/Tether`. The current snapshot branch is `pr-7-conflict-test`, whose tip is commit `60f985d`. That commit was created on March 20, 2026 and squashes a large delta onto parent `8580421`, which is the tip of `codex/merge-upstream-pingdotgg-main-v2`. Current local `main` has advanced well beyond that base and already includes a fork-local replay of upstream work, but not the authored upstream commit chain itself.

The first repair branch created for this work is `codex/pr-7-conflict-test-repaired`, currently based on `main` at `50e76c5`. The authored upstream line already exists locally as `refs/heads/pingdotgg/main` at `fb18b2d`. The frozen safety refs are `safety/main-before-pr7-repair`, `safety/pr-7-conflict-test-snapshot`, and `safety/pr-7-repaired-before-authorship`.

The important comparison surfaces are:

`apps/web/src/composerDraftStore.ts` and `apps/web/src/composerDraftStore.test.ts`, which contain the known regression and its direct coverage.

`apps/server/src/` and `packages/contracts/src/`, where the focused runtime, websocket, and orchestration validation already passes and must remain green after replay.

`working_list.md` and this ExecPlan, which must be kept current as the repair proceeds so a future contributor can recover the context without relying on conversation history.

In this plan, a “repair branch” now means the repaired fork history plus a merge commit that records the authored upstream line `refs/heads/pingdotgg/main` as an ancestor. A “synthetic snapshot” means the current one-commit branch whose tree contains many changes but whose commit graph does not represent the original integration history.

## Plan of Work

First, protect the current state. Keep the existing safety refs for `main` and `pr-7-conflict-test`, then create a new safety ref for `codex/pr-7-conflict-test-repaired`. These refs must not move during the ancestry transplant.

Second, confirm the exact authored upstream base to use. The current local ref `refs/heads/pingdotgg/main` is the most complete authored upstream line available in this checkout and already extends the PR `#7` lineage with the additional newer upstream commits the user called out.

Third, attempt the least-destructive ancestry repair. A full `git rebase --rebase-merges --onto refs/heads/pingdotgg/main ff6a66d <branch>` is the strictest option, but if it expands into broad conflicts, stop and switch to a merge-based repair instead. The merge-based repair is `git merge --no-ff --no-commit --autostash refs/heads/pingdotgg/main` from a fresh copy of the repaired branch. Resolve conflicts in favor of the already-validated repaired behavior from `codex/pr-7-conflict-test-repaired`, keep upstream-only files that do not duplicate existing functionality, and then commit the merge.

Fourth, compare the resulting branch tree against `codex/pr-7-conflict-test-repaired`. The ancestry should change, but the code state should remain equivalent except for any harmless conflict-resolution normalization. In this actual run, duplicate upstream migration files `014_ProjectionThreadProposedPlanImplementation.ts` and `015_ProjectionTurnsSourceProposedPlan.ts` were removed because the repaired branch already contains the same schema changes as migrations `017` and `018`.

Finally, run the repository checks and the focused suites needed to re-establish trust on the authorship-corrected branch. Record the exact branch produced, what validation passed, and what push/update strategy the user should use afterward.

## Concrete Steps

Run all commands from `/Users/axel/Desktop/Code_Projects/Personal/Tether` unless a package path is specified.

Protect the current state and create the authorship repair branch:

    rtk git branch safety/main-before-pr7-repair main
    rtk git branch safety/pr-7-conflict-test-snapshot pr-7-conflict-test
    rtk git branch safety/pr-7-repaired-before-authorship codex/pr-7-conflict-test-repaired
    rtk git checkout -b codex/pr-7-conflict-test-authorship codex/pr-7-conflict-test-repaired

Inspect whether any local commit chain is recoverable and confirm the authored base:

    rtk proxy git reflog --all --date=iso
    rtk proxy git fsck --full --no-progress
    rtk proxy git log --graph --oneline --decorate --all
    rtk proxy git rev-list --left-right --count refs/heads/pingdotgg/main...codex/pr-7-conflict-test-repaired

Attempt the strict ancestry transplant:

    rtk git checkout -b codex/pr-7-conflict-test-authorship codex/pr-7-conflict-test-repaired
    rtk proxy git rebase --rebase-merges --onto refs/heads/pingdotgg/main ff6a66d codex/pr-7-conflict-test-authorship

If the rebase explodes into broad conflicts, abort it and use a merge instead:

    rtk proxy git rebase --abort
    rtk proxy git merge --no-ff --no-commit --autostash refs/heads/pingdotgg/main

In this actual run, the merge was finalized as:

    rtk proxy git commit -m "merge(upstream): adopt pingdotgg main ancestry for pr-7 repair"

After the ancestry repair, compare the branch tree against the pre-transplant repaired branch:

    rtk proxy git diff --stat safety/pr-7-repaired-before-authorship..codex/pr-7-conflict-test-authorship
    rtk proxy git rev-list --left-right --count refs/heads/pingdotgg/main...codex/pr-7-conflict-test-authorship

Validate incrementally. If the rebase changes code content, run the focused suites that cover the conflict areas before running the full required checks.

The logical replay actually used during implementation was:

1. `chore(recovery): replay tooling and workflow updates`
2. `feat(desktop): replay shell environment sync changes`
3. `feat(server): replay orchestration and contracts updates`
4. `feat(web): replay chat and composer updates`
5. `fix(recovery): finalize replay validation cleanup`

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
Acceptance now requires a repaired branch descended from `refs/heads/pingdotgg/main`, a preserved frozen copy of the snapshot branch and the first repaired branch, and an ancestry that no longer reports the authored upstream line as missing. The authorship-corrected branch must pass root `bun fmt`, `bun -b lint`, and `bun typecheck`, plus the focused server, contracts, and web test suites listed above if the ancestry repair changes code content.

The queued-message composer regression is part of acceptance. Loading a queued message into the composer must no longer throw when the persisted draft lacks `terminalContexts`, and `apps/web/src/composerDraftStore.test.ts` must pass.

If browser-only chat files were replayed, acceptance also requires the targeted browser suite to pass.

## Idempotence and Recovery

The safety-ref creation commands are idempotent only if the branch names are unused; if they already exist, inspect them before reusing or create timestamped variants instead. All ancestry-repair work happens on a fresh branch, so the recovery path is to discard that branch and recreate it from `codex/pr-7-conflict-test-repaired` while keeping `pr-7-conflict-test`, the first repaired branch, and the safety refs untouched.

When copying files from the snapshot branch, do not reset `main` or the snapshot branch. If a logical slice proves incorrect, restore only the affected paths from `HEAD` on the repair branch and replay that slice again.

## Artifacts and Notes

Current known failing signal before the repair:

    FAIL  src/composerDraftStore.test.ts > composerDraftStore queued messages > loads a queued message into the composer and swaps existing sendable content back into place
    TypeError: Cannot read properties of undefined (reading 'length')
    at Object.partialize src/composerDraftStore.ts:1970:38

Current known healthy signals before the ancestry transplant:

    apps/server focused suites: 5 passed, 122 tests passed, 1 skipped
    packages/contracts focused suites: 2 passed, 26 tests passed
    root bun typecheck: passed

First repaired branch validation:

    PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun fmt                      -> passed
    PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun -b lint                  -> passed with 0 warnings
    PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun typecheck                -> passed
    apps/server focused Vitest suite                                    -> 123 passed, 1 skipped
    packages/contracts focused Vitest suite                             -> 26 passed
    apps/web focused Vitest suite                                       -> 73 passed
    apps/web ChatView browser suite                                     -> 47 passed

Authorship-corrected branch validation:

    PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun fmt                      -> passed
    PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun -b lint                  -> passed with 0 warnings
    PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun typecheck                -> passed

## Interfaces and Dependencies

This repair uses Git branch refs as the safety mechanism and relies on the existing Bun, Vitest, and Turbo toolchain already checked into the repository. The authorship-corrected branch must preserve the current provider/runtime contracts in `packages/contracts/src/`, the current websocket/server behavior in `apps/server/src/`, and the current queued-message and composer draft interfaces in `apps/web/src/` while keeping the missing-array compatibility bug fixed.

Revision note: Created on 2026-03-20 to drive the repair of `pr-7-conflict-test` from current local `main`, preserve the snapshot branch as a frozen reference, and fold the queued-message composer fix into the recovery work.

Revision note: Updated on 2026-03-20 after creating the safety refs and the repair branch so the remaining work can proceed without mutating the snapshot branch.

Revision note: Updated on 2026-03-20 after the full replay completed to record the actual commit grouping, the final validation results, and the remaining limitation that exact cloud-history recovery still requires an external export artifact.

Revision note: Updated on 2026-03-20 after discovering that the local-`main` replay still hides the authored upstream PR `#7` lineage; the next phase now transplants the repaired history onto `refs/heads/pingdotgg/main` so GitHub can reflect upstream authorship correctly.

Revision note: Updated on 2026-03-20 after the full rebase attempt proved too conflict-heavy; the implementation now records the authored upstream line through merge commit `68c81e0`, which fixes the behind-count while preserving the validated repaired tree.
