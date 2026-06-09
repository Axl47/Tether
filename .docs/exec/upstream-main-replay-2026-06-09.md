# Replay Tether Changes Onto Live Upstream Main

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `.docs/PLANS.md` from the repository root.

## Purpose / Big Picture

This migration creates a new Tether branch on top of the latest `pingdotgg/t3code` main branch without changing the checked-out files in `/Users/axel/Desktop/Code_Projects/Personal/Tether`, which is being used to run Tether. The migration work happens in the sibling worktree `/Users/axel/Desktop/Code_Projects/Personal/Tether-upstream-replay` on branch `sync/upstream-main-2026-06-09`.

After this work, Tether should keep its project identity and the most important Codex-first reliability and UX behavior while benefiting from the newer upstream base. The result is visible by running the normal repository checks in the replay worktree and manually launching the app from that worktree.

## Progress

- [x] (2026-06-09) Confirmed current checkout is clean and `main` equals `origin/main` at `825f87f7`.
- [x] (2026-06-09) Created safety refs for current `main` and stale local upstream.
- [x] (2026-06-09) Fetched live upstream `pingdotgg/t3code@main` into `refs/remotes/upstream-pingdotgg/live-main` at `a3422a9b`.
- [x] (2026-06-09) Created sibling worktree `/Users/axel/Desktop/Code_Projects/Personal/Tether-upstream-replay` on `sync/upstream-main-2026-06-09`.
- [x] (2026-06-09) Restored `.docs/PLANS.md` and added this migration ExecPlan.
- [x] (2026-06-09) Built the curated replay ledger from Tether's current branch.
- [x] (2026-06-09) Replayed repo identity and project instructions while preserving upstream pnpm/vp tooling.
- [x] (2026-06-09) Replayed Tether desktop/web branding onto upstream's current branding paths.
- [x] (2026-06-09) Confirmed GPT-5.5 model support is already present in upstream.
- [x] (2026-06-09) Confirmed git action completion toasts already include commit ids in upstream.
- [x] (2026-06-09) Confirmed stale stop/interruption handling is already present in upstream provider/orchestration layers.
- [x] (2026-06-09) Replayed local Tether discovery records using the new EnvironmentAuth/WebSocket ticket flow.
- [x] (2026-06-09) Ran final formatting, linting, typecheck, test, and Git whitespace verification.

## Surprises & Discoveries

- Observation: The live upstream base has migrated from Bun/Turbo to pnpm/vp.
  Evidence: `package.json` in the live upstream worktree has `"packageManager": "pnpm@10.24.0"` and scripts such as `"typecheck": "vp run -r --concurrency-limit 2 typecheck"`.
- Observation: The local stale `upstream-pingdotgg/main` ref is substantially behind live upstream.
  Evidence: GitHub compare reported live upstream is 202 commits ahead of `c83bc5d48a2bf983acb1c8aaff3d34f86c14032e`.
- Observation: Several Tether fixes are already present in live upstream in a newer shape.
  Evidence: `apps/web/src/modelSelection.test.ts` and `apps/server/src/serverSettings.test.ts` already cover `openai/gpt-5.5`; `apps/server/src/git/GitManager.ts` summarizes pushed/committed SHAs in completion toast titles; provider/orchestration layers already contain stop/interruption handling for active sessions and stale requests.
- Observation: The old custom Pragma route is not directly compatible with the live upstream auth boundary.
  Evidence: Tether's old route used `ServerAuth` and `SessionCredentialService`, while live upstream uses `EnvironmentAuth`, `SessionStore`, OAuth-style scopes, and `wsTicket` WebSocket authentication.
- Observation: The replay worktree initially had no global `vp` and no local `node_modules`.
  Evidence: `rtk proxy vp ...` failed with "No such file or directory"; `pnpm install --frozen-lockfile` installed dependencies and ran `effect-tsgo patch`.
- Observation: Final `vp check` passes while reporting unrelated upstream lint warnings.
  Evidence: `rtk proxy pnpm exec vp check` exits 0 and reports nine `react(no-unstable-nested-components)` warnings in existing web/mobile files outside this replay.

## Decision Log

- Decision: Use a sibling worktree instead of rewriting the active checkout.
  Rationale: The current Tether checkout is being used to run the app, and a worktree isolates file edits while still sharing Git object storage.
  Date/Author: 2026-06-09 / Codex
- Decision: Treat pnpm/vp as part of the new upstream base instead of forcing Bun/Turbo back into the migrated branch.
  Rationale: Live upstream's package scripts, lockfile, and tooling have already moved together. Reverting only package manager metadata would create a mixed toolchain and increase verification risk.
  Date/Author: 2026-06-09 / Codex
- Decision: Replay curated feature bundles instead of blindly rebasing all local commits.
  Rationale: The local Tether branch includes historical sync plans, provider experiments, and code that may be obsolete or upstreamed. Curated replay keeps the new branch maintainable.
  Date/Author: 2026-06-09 / Codex
- Decision: Preserve local discovery records but not the old `/pragma` RPC route in this migration pass.
  Rationale: Discovery is Tether-specific and small enough to adapt safely. The old route depends on replaced auth/services and would need a separate Pragma client contract review. The migrated discovery record uses upstream's standard `/ws` WebSocket route with a short-lived `wsTicket`.
  Date/Author: 2026-06-09 / Codex
- Decision: Treat GPT-5.5 support, git commit-id toasts, and stale stop/interruption handling as upstreamed.
  Rationale: Live upstream already contains equivalent or broader implementations, so replaying older patches would duplicate behavior and risk regressions.
  Date/Author: 2026-06-09 / Codex

## Outcomes & Retrospective

The first replay bundle restored Tether identity, desktop/web branding, project instructions, and local discovery records on the live upstream base. Focused tests for branding, desktop environment identity, build artifact product naming, and local discovery pass. Full repository verification also passes on the replay worktree.

## Context and Orientation

The active Tether checkout is `/Users/axel/Desktop/Code_Projects/Personal/Tether` on `main` at `825f87f7`. That checkout must remain usable and must not receive file edits during this migration. The replay checkout is `/Users/axel/Desktop/Code_Projects/Personal/Tether-upstream-replay`.

The upstream project is `pingdotgg/t3code`. The stale local upstream reference before this migration was `upstream-pingdotgg/main` at `c83bc5d48a2bf983acb1c8aaff3d34f86c14032e`. The live upstream base fetched for this migration is `refs/remotes/upstream-pingdotgg/live-main` at `a3422a9bb51d73724b9b665ae0ef1fb756f753d1`.

The most important Tether changes to consider are visible by comparing `safety/upstream-pingdotgg-main-before-live-fetch-2026-06-09..origin/main`. Current first-parent commits include:

- `ad179ff4 feat(server): publish local Tether discovery records for Pragma`
- `e5760e18 feat(git): add commit id copy action to success toasts`
- `5ade17e7 docs: add front matter metadata to documentation files`
- `b8c0380e feat(codex): add GPT-5.5 as the default supported Codex model`
- `6b14a86d fix(web): restore queued turn dispatcher after environment merge`
- `fa8a6bf1 fix(git): restore commit dialog commit-and-push dropdown`
- `c8a4eea5 fix(web): restore queue and steer composer behavior`
- `316a7a00 fix(chat): restore queued follow-up steering during active turns`
- `a2f42014 fix(orchestration): settle stale running turns on stop`
- `825f87f7 fix(pragma): restore server-backed desktop context integration`

## Plan of Work

First, keep the upstream toolchain intact. Do not overwrite `package.json`, `pnpm-lock.yaml`, or `pnpm-workspace.yaml` with older Bun/Turbo versions unless a specific preserved feature requires a package dependency. If dependencies are needed, add them using the upstream package manager and commit the resulting lockfile changes.

Second, replay repo identity and working rules. The root `AGENTS.md` should refer to Tether, Codex-first behavior, ExecPlans, and `rtk`, while preserving upstream's package roles and vendored repository guidance.

Third, build a replay ledger and decide feature by feature whether to port, skip, or defer. The ledger should be based on code inspection, not only commit messages. For every candidate feature, inspect both old Tether code and live upstream code before changing files. The current ledger decisions are:

- Replayed: root project instructions, `.docs/PLANS.md`, migration ExecPlan, Tether README identity, desktop/web branding, desktop artifact product/app id, and local Tether discovery records.
- Upstreamed already: GPT-5.5 model support, git completion toasts that show commit ids, and stale stop/interruption handling.
- Deferred: the old custom `/pragma` WebSocket RPC route and broad old queue/steer composer patch set, because live upstream has newer plan-follow-up, provider runtime, and auth architecture that requires a separate UX/API review before porting old code.
- Dropped: historical upstream sync ExecPlans, old Bun/Turbo toolchain changes, and broad provider experiments not needed for the curated Tether replay.

Fourth, port the runtime changes in narrow commits. The preferred order is contracts, server/orchestration, web UI/state, then desktop/Pragma. After each bundle, run the smallest useful test command and record the result in this file and `working_list.md`.

## Concrete Steps

Run these commands from the active checkout only for preflight and ref management:

    cd /Users/axel/Desktop/Code_Projects/Personal/Tether
    rtk git status --short --branch
    rtk git branch safety/main-before-upstream-replay-2026-06-09 main
    rtk git branch safety/upstream-pingdotgg-main-before-live-fetch-2026-06-09 upstream-pingdotgg/main
    rtk git fetch --no-tags https://github.com/pingdotgg/t3code.git refs/heads/main:refs/remotes/upstream-pingdotgg/live-main
    rtk git worktree add ../Tether-upstream-replay -b sync/upstream-main-2026-06-09 refs/remotes/upstream-pingdotgg/live-main

Run all implementation commands from the replay worktree:

    cd /Users/axel/Desktop/Code_Projects/Personal/Tether-upstream-replay
    rtk git status --short --branch
    rtk git diff --stat safety/upstream-pingdotgg-main-before-live-fetch-2026-06-09..origin/main
    rtk git log --first-parent --oneline safety/upstream-pingdotgg-main-before-live-fetch-2026-06-09..origin/main

## Validation and Acceptance

The final branch is acceptable when these checks pass from `/Users/axel/Desktop/Code_Projects/Personal/Tether-upstream-replay`:

    rtk vp check
    rtk vp run typecheck
    rtk vp run test

If the implementation changes native mobile code, also run:

    rtk vp run lint:mobile

Manual acceptance should verify that the app launches from the replay worktree, existing Codex sessions can start or resume, queued follow-up messages steer the active turn correctly, git commit success toasts expose commit ids, and desktop/Pragma context integration still publishes local Tether discovery records if the desktop runtime is enabled.

Focused verification run:

    rtk proxy pnpm exec vp test run apps/server/src/localTetherDiscovery.test.ts
    Result: passed 3 tests.

    rtk proxy pnpm exec vp test run apps/web/src/branding.test.ts apps/desktop/src/app/DesktopEnvironment.test.ts scripts/build-desktop-artifact.test.ts
    Result: passed 16 tests across 3 files.

    rtk proxy pnpm exec vp test run apps/server/src/localTetherDiscovery.test.ts apps/web/src/branding.test.ts apps/desktop/src/app/DesktopEnvironment.test.ts scripts/build-desktop-artifact.test.ts
    Result: passed 19 tests across 4 files after final discovery typing changes.

Final verification run:

    rtk proxy pnpm exec vp check
    Result: passed. Reported nine unrelated `react(no-unstable-nested-components)` warnings in existing web/mobile files.

    rtk proxy pnpm exec vp run typecheck
    Result: passed. Reported one unrelated desktop Effect suggestion in `apps/desktop/src/backend/tailscaleEndpointProvider.ts`.

    rtk proxy pnpm exec vp run test
    Result: passed 1172 tests with 7 skipped.

    rtk git diff --check
    Result: passed.

## Idempotence and Recovery

The safety refs preserve the original branch tips. If the migration branch becomes unusable, remove only the replay worktree and branch:

    cd /Users/axel/Desktop/Code_Projects/Personal/Tether
    rtk git worktree remove ../Tether-upstream-replay
    rtk git branch -D sync/upstream-main-2026-06-09

The active checkout remains on `main` and should not be changed by file edits in this migration.

## Artifacts and Notes

Initial observed refs:

    main/origin/main: 825f87f73dd7ed73c11767a507a244fdace174da
    stale upstream:   c83bc5d48a2bf983acb1c8aaff3d34f86c14032e
    live upstream:    a3422a9bb51d73724b9b665ae0ef1fb756f753d1

## Interfaces and Dependencies

Keep `packages/contracts` as schema-only. Keep `packages/shared` as runtime utilities with explicit subpath exports. Do not add new browser/server API methods unless a preserved Tether feature cannot work without them. When a preserved feature needs an existing Tether schema field, port the schema and all corresponding server and web consumers together in the same bundle.
