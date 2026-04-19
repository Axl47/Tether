---
created_at: 2026-04-19T19:21Z
updated_at: 2026-04-19T23:58Z
---
# Working List

## Pending

- [ ] Audit merged tree for dropped Tether behavior, conflict markers, and stale repo-owned `T3Code` naming
- [ ] Run targeted upstream-overlap tests
- [ ] Run `bun fmt`, `bun lint`, and `bun typecheck`
- [ ] Finalize ExecPlan and working list outcomes
- [ ] Create the final merge commit on `Sync-upstream`

## In Progress

- [~] Audit merged tree via typecheck and targeted compatibility fixes

## Done

- [x] Confirm clean `Sync-upstream` worktree and current tip `5ade17e7`
- [x] Create safety branch `safety/sync-upstream-before-upstream-2026-04-19`
- [x] Review the prior upstream integration ExecPlan and existing checklist context
- [x] Write the current upstream integration ExecPlan
- [x] Fetch upstream `pingdotgg/t3code` main into `refs/remotes/upstream-pingdotgg/main`
- [x] Merge upstream main into `Sync-upstream`
- [x] Resolve merge conflicts across server, web, desktop, contracts, and docs
