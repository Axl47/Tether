# Bring `work` Into Full Parity With Local `master`

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository includes `.docs/PLANS.md`. This document must be maintained in accordance with `.docs/PLANS.md`.

## Purpose / Big Picture

After this work, the current `work` branch will both (1) typecheck cleanly again and (2) contain the remaining changes that exist on local `master` so the branch is functionally at parity with `main` plus the newer upstream merge. A contributor should be able to start from this branch, run the required validation commands from the repository root, and get a clean result without needing to manually replay commits or resolve hidden semantic merge fallout.

The observable proof is straightforward: `git log --left-right --graph work...master` should show no remaining local-`main` commits missing from `work`, `bun fmt`, `bun -b lint`, and `bun typecheck` should pass, and manual smoke checks should confirm the merged Tether UX still behaves correctly.

## Progress

- [x] (2026-03-20 00:06Z) Reproduced the current post-merge validation state and confirmed the first blocking failures were in `apps/web`.
- [x] (2026-03-20 00:12Z) Reduced the `apps/web` typecheck fallout by reconciling timestamp formatting imports/props, queued-message terminal-context defaults, and required prop updates in `ChatView`, `ChatHeader`, `ComposerPromptEditor`, and route close-diff handling.
- [x] (2026-03-20 00:33Z) Resolved the remaining root `bun typecheck` failures by reconciling the installed toolchain/dependency environment and unifying the `effect` package identity used by the server/tooling packages during validation.
- [x] (2026-03-20 01:23Z) Restored the missing local `master` ref from the reflog and merged its 61 missing commits into `work`, resolving the textual conflicts across web, server, contracts, and migration surfaces.
- [ ] Reconcile the remaining post-merge `bun typecheck` failures in `apps/server`, which are currently Effect layer/environment typing regressions in integration tests and server entrypoints under the merged dependency graph.
- [x] (2026-03-20 00:33Z) Re-ran `bun fmt`, `bun -b lint`, and `bun typecheck` under the `.mise.toml` toolchain and got a clean result.

## Surprises & Discoveries

- Observation: the original root `bun typecheck` failure was masked by toolchain selection issues; running the repo under the versions declared in `.mise.toml` (`node 24.13.1`, `bun 1.3.9`) is necessary to get an accurate signal.
  Evidence: `bun typecheck` under older Node/Bun failed in `apps/marketing` before reaching the real merged-code errors, while `mise exec node@24.13.1 bun@1.3.9 -- bun typecheck` progressed into the actual web/server compile failures.

- Observation: before the final environment reconciliation, the remaining root typecheck failures were concentrated in `apps/server`, not the web package.
  Evidence: `cd apps/web && bun run typecheck` succeeded after the web fixes, while root `bun typecheck` still reported `t3#typecheck` errors in server integration/tests and `scripts/cli.ts` until the `effect` package identity was unified for validation.

- Observation: this checkout does not currently contain a local `master` branch or any configured remote-tracking `master` ref, so parity replay cannot be completed mechanically from Git history alone.
  Evidence: `git show-ref --heads --dereference` returns only `refs/heads/work`.

## Decision Log

- Decision: keep the web-side fixes minimal and compatibility-oriented instead of attempting another large structural rewrite.
  Rationale: the immediate need is to restore a green validation baseline before replaying more `main` changes; small compatibility fixes reduce risk while preserving the prior semantic merge work.
  Date/Author: 2026-03-20 / Codex

- Decision: treat `.mise.toml` as the source of truth for local validation while finishing this parity branch.
  Rationale: the repo explicitly declares Node and Bun versions there, and using older toolchains produced misleading failures unrelated to the actual merge state.
  Date/Author: 2026-03-20 / Codex

## Outcomes & Retrospective

The branch now contains the previously missing local `master` history and the merge conflicts are resolved, so parity replay is no longer blocked by missing Git refs. The remaining open item is restoring a clean validation baseline: `bun fmt` and `bun -b lint` pass, but root `bun typecheck` still fails in `apps/server` on merged Effect layer/environment typing.

## Context and Orientation

The current branch is `work`. It already contains an upstream `pingdotgg/t3code` merge commit plus local Tether-specific commits. The remaining validation failures live primarily in `apps/server`, especially integration tests, CLI bootstrapping, and Effect layer wiring. The relevant server surfaces include `apps/server/integration/OrchestrationEngineHarness.integration.ts`, `apps/server/integration/providerService.integration.test.ts`, `apps/server/scripts/cli.ts`, `apps/server/src/git/Layers/CodexTextGeneration.test.ts`, `apps/server/src/wsServer.test.ts`, and `apps/server/src/wsServer.ts`.

“Parity with main” means this branch should contain every change currently on local `master`, not just upstream `t3code` changes. To verify that, compare branch histories directly and inspect any remaining left/right commits or semantic diffs before declaring the task complete.

## Plan of Work

First, obtain a local or remote `master` reference for comparison. Without that ref, parity replay cannot be completed mechanically in this checkout.

Second, once `main` is available, compare `work` against local `master` using left/right log and diff views. If there are commits only on `main`, either cherry-pick them or manually replay the semantic changes onto `work`. Record every replay decision here, including why a change was kept, superseded, or intentionally skipped.

Third, rerun the required repository checks and then perform focused manual verification of the areas most likely to regress: sidebar state, queued follow-ups, terminal drawer/context flows, plan sidebar behavior, and provider/runtime orchestration.

## Concrete Steps

Run all commands from `/workspace/Tether`.

Validate using the repo-declared toolchain:

    mise exec node@24.13.1 bun@1.3.9 -- bun fmt
    mise exec node@24.13.1 bun@1.3.9 -- bun -b lint
    mise exec node@24.13.1 bun@1.3.9 -- bun typecheck

Compare branch parity with local `master`:

    git log --oneline --left-right --graph work...master
    git diff --stat --find-renames work...master

Inspect the remaining server failures in isolation:

    cd apps/server && PATH="$HOME/.local/share/mise/installs/node/24.13.1/bin:$HOME/.local/share/mise/installs/bun/1.3.9/bin:/usr/bin:/bin" bun run typecheck

If the failure set is still too broad, run narrower package-local checks (for example the specific integration or layer test/typecheck files that mention `Effect`, `Layer`, `FileSystem`, or `NodeServices`) and record the exact commands/results here as the plan evolves.

## Validation and Acceptance

Acceptance requires all three repository commands to pass under the `.mise.toml` toolchain, no missing local-`main` commits relative to `work`, and successful spot checks of the merged UX/runtime flows.

## Idempotence and Recovery

The validation commands are safe to repeat. If a parity replay goes wrong, recover by resetting only the affected files from `master` or by checking out a fresh temporary branch from the current `work` head and reapplying the parity patch there.

## Artifacts and Notes

Current known blocker summary:

    No remaining validation blocker. Root `bun fmt`, `bun -b lint`, and `bun typecheck` now pass
    under `node 24.13.1` and `bun 1.3.9`. The remaining open item is obtaining a local or remote `master` ref
    so parity can be verified and any unreplayed `main`-only work can be compared mechanically.

## Interfaces and Dependencies

Use the versions declared in `.mise.toml`: `node = "24.13.1"` and `bun = "1.3.9"`. Server fixes should preserve the current contracts package schemas and should avoid introducing new duplicate runtime copies of `effect` or `@effect/platform-node` into the type graph.

Revision note: Created on 2026-03-20 after fixing the immediate post-merge web typecheck fallout and identifying the remaining root blocker as server-side Effect typing plus local-`main` parity work.

Revision note: Updated on 2026-03-20 after restoring the missing `master` ref from the reflog, merging it into `work`, and recording the remaining post-merge server typecheck blockers.
