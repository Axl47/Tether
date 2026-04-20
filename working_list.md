---
created_at: 2026-04-19T19:21Z
updated_at: 2026-04-20T05:28Z
---

# Working List

## Pending

- [ ] Re-run the server integration overlap suites in a Vitest environment that uses Node `>=22.16` so the sqlite-backed tests can execute past startup.
- [ ] If the React maximum update depth loop still reproduces after the controlled-open guard fix, capture a live browser repro with component-level instrumentation and isolate the next external-store source.

## In Progress

- [~] Prepare user verification for the follow-up controlled-open guard fix

## Done

- [x] Confirm clean `Sync-upstream` worktree and current tip `5ade17e7`
- [x] Create safety branch `safety/sync-upstream-before-upstream-2026-04-19`
- [x] Review the prior upstream integration ExecPlan and existing checklist context
- [x] Write the current upstream integration ExecPlan
- [x] Fetch upstream `pingdotgg/t3code` main into `refs/remotes/upstream-pingdotgg/main`
- [x] Merge upstream main into `Sync-upstream`
- [x] Resolve merge conflicts across server, web, desktop, contracts, and docs
- [x] Audit the merged tree via targeted typecheck-driven compatibility fixes and `git diff --check`
- [x] Run targeted overlap suites for server/web units; record the Node `20.19.4` sqlite blocker for server integration suites
- [x] Run `bun fmt`, `bun -b lint`, and `bun typecheck`
- [x] Finalize ExecPlan and working list outcomes
- [x] Capture the post-merge stabilization pass in follow-up commit `316196ef`
- [x] Fix the provider cache atomic temp-file collision and validate desktop startup no longer shows the rename error
- [x] Harden root-level shell state subscriptions against several no-op external-store writes in commit `8116cf32`
- [x] Trace the render loop to controlled open/close handlers in the merged diff panel shell and add no-op guards plus regression coverage
