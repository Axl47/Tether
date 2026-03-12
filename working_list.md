# Working List

## Pending

- [ ] Commit the integration branch with a conventional commit message

## In Progress

- [~] Investigate why `apps/web/src/components/ChatView.browser.tsx` hangs in browser-mode shutdown after beginning test execution

## Done

- [x] Inspect the latest upstream refs and confirm PR `#3` follows the refreshed `upstream-pingdotgg/main` line
- [x] Create fresh branch `codex/merge-upstream-pingdotgg-main-v2` from current local `main`
- [x] Refresh ExecPlan and working list for the fresh upstream PR 3 merge branch
- [x] Merge `upstream-pingdotgg/main` (`ff6a66d`) into `codex/merge-upstream-pingdotgg-main-v2` and document the conflict set
- [x] Resolve sidebar/status overlap so live-activity pills remain upstream-correct and awaiting-input stays orange
- [x] Resolve ChatView/project-actions overlap so queued follow-ups, header plan toggle, and multi-terminal actions all survive
- [x] Resolve server/contracts/branding overlap, keeping runtime/ws fixes while preserving `ProjectScript.steps`, `projects.readFile`, and Tether naming
- [x] Run conflict checks and targeted overlap tests for server/runtime and web state surfaces
- [x] Run `bun lint` and `bun typecheck`
