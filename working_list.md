---
created_at: 2026-04-19T19:21Z
updated_at: 2026-04-20T01:14Z
---

# Working List

## Pending

- [ ] Re-run the server integration overlap suites in a Vitest environment that uses Node `>=22.16` so the sqlite-backed tests can execute past startup.
- [ ] Capture the current stabilization pass in a follow-up commit on `Sync-upstream`.

## In Progress

- [~] Package the post-merge stabilization changes for handoff on top of committed merge snapshot `7e6b2bc1`

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
